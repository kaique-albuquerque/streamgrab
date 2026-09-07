/**
 * Helpers puros do engine — funcoes sem I/O, sem dependencias de estado.
 * Separados para facilitar testes unitarios e reduzir o tamanho do engine.js.
 */

import { maskUrl } from '../../utils.js';
import { createRequestContext } from '../request-context.js';
import { isValidDownloadPlan } from '../download-plan.js';

export const FALLBACK_TITLE = 'video';

export function isAbortReasonPause(reason) {
  return reason === 'pause';
}

/**
 * Re-resolve a variante escolhida (selectedUrl) contra a analise mais recente
 * (variantes do master HLS). Os tokens de sessao do mdstrm mudam a cada
 * analise: o selectedUrl vindo da UI pode estar com tokens expirados quando o
 * engine roda (o renderer analisa, o usuario escolhe qualidade e enfileira —
 * e o engine RE-analisa a URL do player, obtendo tokens frescos). O match e
 * por pathname (estavel entre refreshes), nunca por query string.
 * Retorna a URL absoluta fresca, ou null se nenhuma variante casar.
 */
export function resolveFreshVariant(selectedUrl, variants, baseUrl = '') {
  let selectedPath = null;
  try {
    selectedPath = new URL(selectedUrl).pathname;
  } catch {
    return null;
  }
  for (const variant of variants || []) {
    const uri = variant?.uri || variant?.url;
    if (!uri) continue;
    try {
      const absolute = new URL(uri, baseUrl || selectedUrl).toString();
      if (new URL(absolute).pathname === selectedPath) return absolute;
    } catch {
      /* ignora variante invalida */
    }
  }
  return null;
}

/**
 * Mascara uma URL para diagnostico: alem dos parametros sensiveis do
 * maskUrl (access_token/sid/uid/token), oculta `ot` (one-time token do CDN
 * mdstrm, usado para autorizar a sessao). NUNCA logar tokens completos.
 */
export function maskDiagUrl(value) {
  const masked = maskUrl(value);
  try {
    const u = new URL(masked);
    if (u.searchParams.has('ot')) u.searchParams.set('ot', '***');
    return u.toString();
  } catch {
    return masked;
  }
}

// ---------------------------------------------------------------------------
// Progresso / ETA
// ---------------------------------------------------------------------------

export function progressUpdate(downloaded, total, started) {
  const elapsed = (Date.now() - started) / 1000;
  const speed = elapsed > 0 ? downloaded / elapsed : 0;
  const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 1000) / 10) : 0;
  const etaSeconds = total > 0 && speed > 0 ? (total - downloaded) / speed : null;
  return { bytesDownloaded: downloaded, totalBytes: total, percent, speed, etaSeconds };
}

export function estimateEtaFromPercent(percent, startedAtMs) {
  const pct = Number(percent) || 0;
  if (pct <= 0 || pct >= 100) return null;
  const elapsedSec = (Date.now() - startedAtMs) / 1000;
  if (elapsedSec <= 0) return null;
  const totalSec = elapsedSec / (pct / 100);
  const remaining = totalSec - elapsedSec;
  return remaining > 0 ? remaining : 0;
}

export function abortOutcome(signal, ok = false) {
  if (!signal?.aborted) return ok ? { ok: true } : null;
  return isAbortReasonPause(signal.reason) ? { paused: true } : { cancelled: true };
}

export function segmentProgressToEngine({ done, total, totalBytes, failed }, startedAtMs = Date.now()) {
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 1000) / 10) : 0;
  const elapsedSec = (Date.now() - startedAtMs) / 1000;
  const speed = elapsedSec > 0 ? totalBytes / elapsedSec : 0;
  const etaSeconds = estimateEtaFromPercent(percent, startedAtMs);
  return { bytesDownloaded: totalBytes, totalBytes: 0, percent, speed, etaSeconds, failed };
}

// ---------------------------------------------------------------------------
// FFmpeg progress adapter
// ---------------------------------------------------------------------------

export function makeFfmpegProgress(onProgress, durationMs) {
  let outMs = 0;
  let totalSize = 0;
  let startedAtMs = 0;
  let lastSize = 0;
  let lastSpeedMs = 0;
  let estimatedTotal = 0;
  return ({ key, value }) => {
    if (!startedAtMs) startedAtMs = Date.now();
    if (key === 'out_time_us') outMs = Number(value) / 1000;
    else if (key === 'out_time_ms') outMs = Number(value);
    else if (key === 'total_size') totalSize = Number(value);

    const elapsedSec = (Date.now() - startedAtMs) / 1000;
    const speed = elapsedSec > 0 ? totalSize / elapsedSec : 0;

    let percent = 0;
    let etaSeconds = null;

    if (durationMs > 0) {
      // Caso ideal: duracao conhecida (YouTube, sociais, etc.)
      percent = Math.min(100, Math.round((outMs / durationMs) * 1000) / 10);
      etaSeconds = outMs > 0 ? Math.max(0, (durationMs - outMs) / 1000) : null;
    } else if (totalSize > 0 && elapsedSec > 3) {
      // Sem duracao (HLS via FFmpeg): estimar progresso pela velocidade.
      const windowMs = Date.now() - lastSpeedMs;
      if (windowMs > 2500 && lastSize > 0) {
        const windowSpeed = (totalSize - lastSize) / (windowMs / 1000);
        const blended = speed * 0.3 + windowSpeed * 0.7;
        if (blended > 0) {
          const estimatedRemaining = blended * Math.max(5, elapsedSec * 0.5);
          estimatedTotal = Math.max(estimatedTotal, totalSize + estimatedRemaining);
        }
        lastSize = totalSize;
        lastSpeedMs = Date.now();
      }
      if (estimatedTotal > 0) {
        percent = Math.min(99, Math.round((totalSize / estimatedTotal) * 1000) / 10);
        const remaining = estimatedTotal - totalSize;
        etaSeconds = speed > 0 ? remaining / speed : null;
      }
    }

    onProgress({ bytesDownloaded: totalSize, totalBytes: 0, percent, speed, etaSeconds });
  };
}

// ---------------------------------------------------------------------------
// URL / path helpers
// ---------------------------------------------------------------------------

export function safePathname(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

export function isMdstrmPlayerUrl(url) {
  return /^https?:\/\/mdstrm\.com\/video\/[a-f0-9]+\.m3u8/i.test(String(url || ''));
}

// ---------------------------------------------------------------------------
// Prepared download normalization
// ---------------------------------------------------------------------------

function planSourceUrl(source = {}) {
  return String(source.manifestUrl || source.url || '');
}

function toLegacyPrepared(plan) {
  const kind = String(plan?.kind || '');
  const source = plan?.source || {};

  if (kind === 'mux') {
    return {
      strategy: 'mux',
      videoUrl: String(source.videoUrl || ''),
      audioUrl: String(source.audioUrl || ''),
      formatId: String(source.formatId || ''),
      chosenFormat: plan.selectedFormat || null,
      totalBytes: Number(source.totalBytes || 0) || 0,
      durationMs: Number(source.durationMs || 0) || 0,
      _requestContext: plan.requestContext,
      _downloadPlan: plan,
    };
  }

  return {
    strategy: 'single',
    downloadUrl: planSourceUrl(source),
    formatId: String(source.formatId || ''),
    chosenFormat: plan.selectedFormat || null,
    totalBytes: Number(source.totalBytes || 0) || 0,
    durationMs: Number(source.durationMs || 0) || 0,
    _requestContext: plan.requestContext,
    _downloadPlan: plan,
  };
}

export function normalizePreparedDownload(prepared) {
  if (isValidDownloadPlan(prepared)) {
    return toLegacyPrepared(prepared);
  }
  return prepared;
}

export function headersFromRequestContext(requestContext = {}) {
  const context = createRequestContext(requestContext);
  const headers = { ...context.headers };
  if (context.referer && !Object.hasOwn(headers, 'Referer')) headers.Referer = context.referer;
  if (context.origin && !Object.hasOwn(headers, 'Origin')) headers.Origin = context.origin;
  if (context.userAgent && !Object.hasOwn(headers, 'User-Agent')) headers['User-Agent'] = context.userAgent;
  return headers;
}

export function isRefreshableFailure(error) {
  const code = String(error?.code || '');
  return code === 'FORBIDDEN_ERROR' || code === 'EXPIRED_URL' || code === 'EXPIRED_URL_ERROR';
}
