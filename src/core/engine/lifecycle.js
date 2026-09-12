/**
 * DownloadEngine — execution pipeline (analyze → prepare → download).
 *
 * Standalone functions that receive the engine instance as the first
 * parameter, keeping the DownloadEngine class thin.
 */

import { setJobTaskState, transitionJob } from '../models/index.js';
import { CancelledError } from '../errors.js';
import { estimateMuxSpace } from '../disk.js';
import { getDefaultDownloadsDir, normalizeHeaders } from '../../utils.js';
import { mergeRequestContext } from '../request-context.js';
import { resolveSafeFilename, nextAvailableName } from '../filenames.js';
import { embedSubtitles } from './runners/index.js';
import {
  resolveFreshVariant, maskDiagUrl, normalizePreparedDownload,
  headersFromRequestContext, isRefreshableFailure, FALLBACK_TITLE,
} from './helpers.js';

// -- analyze ----------------------------------------------------------------

export async function analyze(engine, job, { selectedUrl, headers, auth, forceYouTube }) {
  transitionJob(job, 'analyzing');
  engine._emit('start', { jobId: job.id, stage: 'analyzing', message: `Analisando ${maskDiagUrl(job.url)}` });
  if (job.meta?.recovered) {
    engine._emit('log', { jobId: job.id, message: '[recovery] Download recuperado apos crash — re-analisando com tokens frescos' });
  }
  const adapter = await engine.resolveAdapter(job.url, { headers, auth, forceYouTube });
  if (adapter.id === 'unknown') {
    const err = new Error('Fonte nao suportada.');
    err.code = 'UNSUPPORTED_SOURCE';
    throw err;
  }
  job._sourceType = adapter.id;
  job.meta.sourceType = adapter.id;
  let raw;
  try {
    raw = await engine.executor.analyze(adapter, { url: job.url, headers, auth });
  } catch (err) {
    if (engine._active.get(job.id)?.attempt?.signal.aborted) throw new CancelledError('Analise cancelada.');
    throw err;
  }
  job.title = raw?.title || job.title;
  job._analysis = raw;
  if (selectedUrl && raw?.kind === 'master' && Array.isArray(raw.variants) && raw.variants.length > 0) {
    const fresh = resolveFreshVariant(selectedUrl, raw.variants, raw.baseUrl);
    if (fresh) {
      engine._emit('log', { jobId: job.id, message: `[mdstrm] variante re-resolvida com tokens frescos: ${maskDiagUrl(fresh)} (era ${maskDiagUrl(selectedUrl)})` });
      selectedUrl = fresh;
    }
  }
  return { adapter, raw, selectedUrl };
}

// -- prepare ----------------------------------------------------------------

export async function prepare(engine, job, adapter, raw, {
  selectedUrl, destination, headers, auth,
  audioLanguage, allAudio, subtitleLanguages = [], embedSubs = false,
}) {
  transitionJob(job, 'preparing');
  engine._emit('progress', { jobId: job.id, stage: 'preparing', message: 'Preparando download' });
  const preparedRaw = await engine.executor.prepare(adapter, {
    url: job.url, analysis: raw, selectedUrl, headers, auth,
    audioLanguage, allAudio, subtitleLanguages, embedSubs,
  });
  const prepared = normalizePreparedDownload(preparedRaw);
  if (engine._isAborted(job)) throw new CancelledError('Download cancelado.');
  job._prepared = prepared;
  job._downloadPlan = prepared?._downloadPlan || null;
  job.meta.totalBytes = Number(prepared.totalBytes || 0);
  job.meta.durationMs = Number(prepared.durationMs || 0);
  const dir = destination || engine.settings?.get?.('defaultDir') || getDefaultDownloadsDir();
  if (engine.disk && job.meta.totalBytes > 0) {
    const extra = prepared.strategy === 'mux'
      ? Math.max(0, estimateMuxSpace(job.meta.totalBytes) - job.meta.totalBytes) : 0;
    await engine.disk.check({ dir, requiredBytes: job.meta.totalBytes, extraBytes: extra });
  }
  return { prepared };
}

// -- resolve output ---------------------------------------------------------

export function resolveOutput(engine, job, prepared, destination) {
  const dir = destination || engine.settings?.get?.('defaultDir') || getDefaultDownloadsDir();
  const base = job.meta?.filename || job.title || FALLBACK_TITLE;
  const ext = extensionFor(prepared, job._sourceType || job.meta?.sourceType);
  return nextAvailableName(resolveSafeFilename(base, { dir, ext }));
}

// -- download loop ----------------------------------------------------------

export async function downloadLoop(engine, job, adapter, preparedInitial, { headers, mode, turbo, turboChunks }) {
  transitionJob(job, 'downloading');
  setJobTaskState(job, 'downloading');
  job._startedAt = Date.now();
  const onProgress = engine._makeProgress(job);
  let prepared = preparedInitial;
  let refreshCount = 0;
  for (;;) {
    const effectiveContext = mergeRequestContext({}, prepared?._requestContext || {});
    const effectiveHeaders = {
      ...headersFromRequestContext(effectiveContext),
      ...normalizeHeaders(headers),
    };
    if (job._cancelRequested) throw new CancelledError('Download cancelado.');
    if (job.state === 'paused') {
      transitionJob(job, 'downloading');
      engine._emit('resume', { jobId: job.id, stage: 'downloading', message: 'Retomando download' });
    }
    const attempt = new AbortController();
    engine._active.set(job.id, { attempt, resume: null });
    const result = await engine.executor.run({
      job, prepared, output: job.meta.output,
      headers: effectiveHeaders, mode, signal: attempt.signal,
      onProgress, atomic: engine.atomic,
      onLog: (message) => engine._emit('log', { jobId: job.id, message }),
      featureFlags: job.meta?.featureFlags || engine.settings?.get?.('features') || {},
      turbo: Boolean(turbo), turboChunks,
    });
    if (result?.paused) {
      transitionJob(job, 'paused');
      engine._emit('pause', { jobId: job.id, stage: 'paused', message: 'Download pausado' });
      await new Promise((resolve) => {
        const entry = engine._active.get(job.id);
        if (entry) entry.resume = resolve;
      });
      continue;
    }
    if (result?.cancelled) throw new CancelledError('Download cancelado.');
    if (!result?.ok) {
      const err = new Error(result?.error || 'Falha no download.');
      err.code = result?.code || 'DOWNLOAD_FAILED';
      err.status = result?.status || 0;
      err.detail = result?.detail || '';
      if (typeof adapter?.refresh === 'function' && prepared?._downloadPlan?.capabilities?.refreshAccess
        && refreshCount < 1 && isRefreshableFailure(err)) {
        const refreshedPlan = await adapter.refresh({
          reason: err.code === 'FORBIDDEN_ERROR' ? 'expired-url' : 'session-refresh',
          statusCode: err.status || 0, currentPlan: prepared._downloadPlan,
          progress: { refreshCount }, refreshAttempt: refreshCount + 1,
        });
        if (refreshedPlan) {
          prepared = normalizePreparedDownload(refreshedPlan);
          job._prepared = prepared;
          job._downloadPlan = prepared?._downloadPlan || null;
          job.meta.totalBytes = Number(prepared.totalBytes || job.meta.totalBytes || 0);
          job.meta.durationMs = Number(prepared.durationMs || job.meta.durationMs || 0);
          refreshCount += 1;
          engine._emit('log', { jobId: job.id, message: `[refresh] plano renovado pelo provider ${adapter.id} (tentativa ${refreshCount})` });
          continue;
        }
      }
      throw err;
    }
    break;
  }
}

// -- subtitles -------------------------------------------------------------

export async function processSubtitles(engine, job, prepared, { subtitleLanguages, embedSubs, headers }) {
  if (subtitleLanguages.length === 0 || !job.meta?.output) return;
  const subtitleTracks = prepared?._analysis?.subtitleTracks || job._analysis?.subtitleTracks || [];
  if (subtitleTracks.length === 0) return;
  engine._emit('log', { jobId: job.id, message: `[subs] processando ${subtitleTracks.length} legenda(s) disponivel(is)` });
  const subResult = await embedSubtitles({
    videoPath: job.meta.output, subtitleTracks,
    selectedLanguages: subtitleLanguages, embedSubs, headers,
    signal: engine._active.get(job.id)?.attempt?.signal,
    onLog: (message) => engine._emit('log', { jobId: job.id, message }),
  });
  if (!subResult?.ok) {
    engine._emit('log', { jobId: job.id, message: `[subs] aviso: ${subResult?.error || 'falha ao processar legendas'}` });
  }
}

// -- helpers ----------------------------------------------------------------

export function extensionFor(prepared, sourceType) {
  if (prepared.strategy === 'mux' || prepared.strategy === 'mux-multi') return '.mp4';
  const st = String(sourceType || '').toLowerCase();
  if (st === 'hls' || st === 'dash') return '.mp4';
  const url = String(prepared.downloadUrl || prepared.url || '');
  try {
    const pathname = new URL(url).pathname || '';
    const m = pathname.match(/\.([A-Za-z0-9]{1,12})$/);
    return m ? `.${m[1].toLowerCase()}` : '.mp4';
  } catch {
    return '.mp4';
  }
}
