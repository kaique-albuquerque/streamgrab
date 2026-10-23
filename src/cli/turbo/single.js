import { formatBytes } from '../../utils.js';
import { downloadParallelRanges } from '../../transports/range/index.js';
import { defaultStatePath, clearState } from '../../core/resume.js';
import { createProgressReporter } from '../progress.js';
import { cleanupPartial } from '../download.js';
import { probeRange, cleanupResumeArtifacts } from './cleanup.js';
import { DEFAULT_TURBO_CHUNKS } from './constants.js';

/**
 * Fluxo turbo (P4): delega ao transporte Range (`src/transports/range.js`),
 * mantendo a API publica atual:
 *   { ok: true } | { ok: false, error: 'no-range' } | { ok: false, interrupted: true } | { ok: false, error: 'other' }
 *
 * `signal` (opcional) e um AbortController — mesmo contrato dos fluxos legados.
 *
 * P6.1: `resume: true` (padrao) — interrupcao MANTEM o parcial + sidecar
 * (`<output>.resume.json`) para a proxima execucao retomar; `resume: false`
 * (flag `--no-resume`) restaura a limpeza antiga do parcial no cancelamento.
 *
 * P6.2: `smartTurbo` (true|objeto) ativa o pool dinamico (rampa/backoff por
 * baseline); `false`/ausente = rollback (pool fixo antigo).
 */
export async function runTurboDownloadFlow(ctx, {
  url,
  output,
  headers = {},
  durationMs = 0,
  label = 'Baixando',
  chunkCount = DEFAULT_TURBO_CHUNKS,
  blockCount,
  signal,
  resume = true,
  smartTurbo,
  onTurboDecision,
  onExpiredUrl,
  onResume,
}) {
  const ownAbort = new AbortController();
  const abort = signal || ownAbort;
  if (!signal) ctx.turboAbort = ownAbort;
  const sig = abort.signal;

  try {
    // 1) Sonda o suporte a Range para informar o total ao reporter de progresso.
    let probe;
    try {
      probe = await probeRange(url, headers, sig);
    } catch (err) {
      if (sig.aborted) {
        if (!resume) cleanupPartial(output);
        return { ok: false, interrupted: true };
      }
      ctx.io.log(`[AVISO] Turbo: ${err.message}`);
      if (!resume) await clearState(defaultStatePath(output));
      return { ok: false, error: 'no-range' };
    }
    if (!probe.ok) {
      ctx.io.log('[AVISO] Turbo: o servidor nao suporta download por partes (Range). Usando fluxo normal.');
      if (!resume) await clearState(defaultStatePath(output));
      return { ok: false, error: 'no-range' };
    }

    const total = probe.total;
    const progress = createProgressReporter(ctx.io, { totalBytes: total, durationMs, label });
    const onTransportProgress = (u) => {
      if (u.bytesDownloaded != null) progress.update({ key: 'total_size', value: u.bytesDownloaded });
      if (u.speed) progress.update({ key: 'speed', value: `${formatBytes(u.speed)}/s` });
    };

    // 2) Limite de conexoes do ResourceManager (quando presente no ctx).
    const available = ctx.resourceLimiter?.connections?.available;
    const concurrency = available != null ? Math.max(1, Math.min(chunkCount, available || 1)) : chunkCount;

    // 3) Download paralelo via transporte Range (P6.1: resume por default).
    await downloadParallelRanges({
      url,
      output,
      headers,
      signal: sig,
      chunkCount,
      blockCount,
      concurrency,
      smartTurbo,
      onProgress: onTransportProgress,
      onTurboDecision: onTurboDecision || ((d) => {
        if (d.action !== 'hold') {
          ctx.io.log(`[turbo] Smart Turbo: ${d.action === 'up' ? 'subindo' : 'reduzindo'} para ${d.concurrency} conexoes (${d.reason}).`);
        }
      }),
      resume,
      onExpiredUrl,
      onResume,
    });

    if (sig.aborted) {
      if (!resume) cleanupPartial(output);
      return { ok: false, interrupted: true };
    }

    progress.update({ key: 'total_size', value: total });
    progress.update({ key: 'progress', value: 'end' });
    progress.finish();
    ctx.io.log(`[turbo] Download concluido com ${chunkCount} conexoes paralelas.`);
    return { ok: true };
  } catch (err) {
    if (sig.aborted) {
      if (!resume) cleanupPartial(output);
      return { ok: false, interrupted: true };
    }
    if (err?.code === 'RANGE_UNSUPPORTED' || err?.code === 'INVALID_CONTENT_RANGE') {
      ctx.io.log('[AVISO] Turbo: o servidor parou de responder Range no meio do download. Usando fluxo normal.');
      if (resume) {
        // P6.1: descarta parcial + sidecar antes do fallback (re-baixa limpo).
        await cleanupResumeArtifacts(output);
      } else {
        cleanupPartial(output);
      }
      return { ok: false, error: 'no-range' };
    }
    ctx.io.log(`[AVISO] Turbo falhou (${err.message}). Usando fluxo normal.`);
    if (resume && err?.code !== 'RANGE_UNSUPPORTED' && err?.code !== 'INVALID_CONTENT_RANGE') {
      // P6.1: erro nao-terminal -> mantem parcial + sidecar p/ retomada futura
      // (o fluxo normal recomeca; nada e corrompido — resume valida por ETag).
      ctx.io.log('[Resume] Parcial preservado; a proxima execucao retoma deste ponto.');
    } else {
      cleanupPartial(output);
      await clearState(defaultStatePath(output));
    }
    return { ok: false, error: 'other' };
  } finally {
    if (!signal) ctx.turboAbort = null;
  }
}
