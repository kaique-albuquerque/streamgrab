/**
 * Range transport — download orchestrator with resume and Smart Turbo.
 */

import fs from 'node:fs';
import { CancelledError } from '../../core/errors.js';
import {
  defaultStatePath, createState, loadState, saveState, clearState, completedBytes,
} from '../../core/resume.js';
import { resolveResumeSession } from '../../core/session.js';
import { createSmartTurbo, normalizeSmartTurbo, isRetryableChunkError } from '../../core/smart-turbo.js';
import { parseRetryAfter } from '../../core/retry.js';
import { probeRangeSupport, computeRanges, DEFAULT_RANGE_CHUNKS } from './probe.js';
import { fetchChunk } from './chunk.js';

/**
 * Baixa `url` em partes paralelas via HTTP Range com resume e Smart Turbo.
 */
export async function downloadParallelRanges({
  url, output, headers = {}, signal, onProgress,
  chunkCount = DEFAULT_RANGE_CHUNKS, blockCount, concurrency, timeoutMs = 0,
  validateMedia = true, resume = true, smartTurbo, onTurboDecision,
  statePath, onExpiredUrl, onResume,
} = {}) {
  const desiredConcurrency = Math.max(1, Math.floor(concurrency || chunkCount));
  const desiredBlockCount = Number.isInteger(blockCount) && blockCount > 0
    ? blockCount : Math.max(1, Math.floor(chunkCount || DEFAULT_RANGE_CHUNKS));
  const sp = statePath || defaultStatePath(output);

  // --- P6.1: decisao de resume ---
  let probe;
  let state = null;
  let ranges = [];
  let fileMode = 'w';
  let resumedBytes = 0;

  if (resume) {
    let probeError = null;
    try { probe = await probeRangeSupport(url, { headers, signal, timeoutMs }); } catch (err) { probeError = err; }
    const decision = await resolveResumeSession({
      state: loadState(sp), url, headers, probe, probeError,
      resolveFreshUrl: onExpiredUrl,
      probeRange: (u) => probeRangeSupport(u, { headers, signal, timeoutMs }),
      onReanalyze: (info) => onResume?.({ action: 'reanalyze', reason: info.reason, resumedBytes: 0 }),
    });
    if (decision.action === 'error') throw decision.error;
    url = decision.url || url;
    probe = decision.probe;

    if (decision.action === 'resume') {
      state = decision.state;
      ranges = state.chunks.filter((c) => !c.completed);
      resumedBytes = completedBytes(state);
      fileMode = 'r+';
      onResume?.({ action: 'resume', reason: decision.reason, resumedBytes });
      const st = await fs.promises.stat(output).catch(() => null);
      if (!st || st.size !== probe.total) {
        await clearState(sp);
        state = null;
        ranges = computeRanges(probe.total, desiredBlockCount);
        resumedBytes = 0;
        fileMode = 'w';
        onResume?.({ action: 'discard', reason: 'parcial ausente ou com tamanho divergente', resumedBytes: 0 });
      }
    } else {
      if (decision.state) await clearState(sp);
      ranges = computeRanges(probe.total, desiredBlockCount);
      onResume?.({ action: decision.action === 'discard' ? 'discard' : 'fresh', reason: decision.reason, resumedBytes: 0 });
    }
  } else {
    probe = await probeRangeSupport(url, { headers, signal, timeoutMs });
    ranges = computeRanges(probe.total, desiredBlockCount);
  }

  const total = probe.total;
  const fh = await fs.promises.open(output, fileMode);
  if (fileMode === 'w') await fh.truncate(total);
  if (resume && !state) {
    state = createState({
      url, destination: output, totalSize: probe.total,
      etag: probe.etag, lastModified: probe.lastModified,
      chunks: ranges.map((r) => ({ ...r, downloaded: 0, completed: false })),
    });
    await saveState(sp, state);
  }

  const started = Date.now();
  let downloaded = resumedBytes;
  let stateWriteChain = Promise.resolve();
  const persistState = () => {
    stateWriteChain = stateWriteChain.then(() => saveState(sp, state)).catch(() => {});
    return stateWriteChain;
  };

  const resumeCtx = resume ? { resume, state, persistState } : null;
  const tracker = { downloaded, started, onProgress };

  // --- P6.2: Smart Turbo pool ---
  let turboTimer = null;
  try {
    const hardLimit = Math.min(desiredConcurrency, ranges.length);
    let turbo = null;
    if (smartTurbo && hardLimit >= 2) {
      const opts = normalizeSmartTurbo(smartTurbo);
      turbo = createSmartTurbo({
        ...opts,
        min: Math.min(opts.min, hardLimit),
        max: Math.min(opts.max, hardLimit),
        initial: Math.min(opts.initial, hardLimit),
      });
    }

    let desired = turbo ? turbo.getConcurrency() : hardLimit;
    let nextWorkerId = 0;
    let next = 0;
    let running = 0;
    const workers = new Set();

    // Smart Turbo window state
    let windowBytes = 0, windowErrors = 0, windowRateLimitedErrors = 0;
    let windowTimeoutErrors = 0, windowRetryAfterMs = 0;
    let windowLatencyMs = 0, windowRequests = 0, windowStart = Date.now();

    const sampleWindow = () => {
      const elapsed = Date.now() - windowStart;
      if (elapsed <= 0 || !turbo) return;
      const decision = turbo.sample({
        bytes: windowBytes, elapsedMs: elapsed, errors: windowErrors,
        concurrency: running, latencyMs: windowLatencyMs, requests: windowRequests,
        rateLimitedErrors: windowRateLimitedErrors, timeoutErrors: windowTimeoutErrors,
        retryAfterMs: windowRetryAfterMs,
        schedulerLimits: { downloadLimit: hardLimit, hostLimit: hardLimit, globalLimit: null },
      });
      windowBytes = 0; windowErrors = 0; windowRateLimitedErrors = 0;
      windowTimeoutErrors = 0; windowRetryAfterMs = 0;
      windowLatencyMs = 0; windowRequests = 0; windowStart = Date.now();
      onTurboDecision?.(decision);
    };

    const spawnWorker = () => {
      const id = nextWorkerId++;
      const p = (async () => {
        running++;
        try {
          while (id < desired && next < ranges.length) {
            const range = ranges[next++];
            const chunkStartedAt = Date.now();
            try {
              await fetchChunk({ chunk: range, url, fh, headers, signal, timeoutMs, validateMedia, total, tracker, resumeCtx });
              windowBytes += range.end - range.start + 1;
              windowLatencyMs += Date.now() - chunkStartedAt;
              windowRequests++;
            } catch (err) {
              if (err?.code === 'RATE_LIMIT_ERROR') {
                windowRateLimitedErrors++;
                windowRetryAfterMs = Math.max(windowRetryAfterMs, parseRetryAfter(err.retryAfter) || 0);
              } else if (err?.code === 'NETWORK_ERROR' && /timeout/i.test(err?.message || '')) {
                windowTimeoutErrors++;
              } else if (isRetryableChunkError(err)) {
                windowErrors++;
              }
              throw err;
            }
          }
        } finally { running--; }
      })();
      const tracked = p.finally(() => workers.delete(tracked));
      workers.add(tracked);
    };

    const resizePool = () => {
      if (!turbo) return;
      desired = turbo.getConcurrency();
      const toSpawn = Math.max(0, desired - running);
      for (let i = 0; i < toSpawn && next < ranges.length; i++) spawnWorker();
    };

    turboTimer = turbo
      ? setInterval(() => { sampleWindow(); resizePool(); }, Math.max(50, turbo.config().windowMs || 1200))
      : null;
    if (turboTimer) turboTimer.unref?.();

    if (turbo) {
      const toSpawn = Math.max(0, desired - running);
      for (let i = 0; i < toSpawn && next < ranges.length; i++) spawnWorker();
    } else {
      for (let i = 0; i < hardLimit; i++) spawnWorker();
    }

    while (workers.size > 0) await Promise.all([...workers]);
    if (resume && state) await clearState(sp);
    return { ok: true, bytesDownloaded: tracker.downloaded, totalBytes: total };
  } catch (err) {
    if (signal?.aborted) throw new CancelledError('Operacao cancelada.');
    throw err;
  } finally {
    clearInterval(turboTimer);
    await fh.close().catch(() => {});
  }
}
