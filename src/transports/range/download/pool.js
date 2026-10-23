/** Pool de workers paralelos com ajuste dinamico do Smart Turbo (P6.2). */

import { createSmartTurbo, normalizeSmartTurbo, isRetryableChunkError } from '../../../core/smart-turbo.js';
import { parseRetryAfter } from '../../../core/retry.js';
import { fetchChunk } from '../chunk.js';

/**
 * Executa o download dos ranges respeitando o limite de concorrencia e,
 * quando habilitado, ajustando o tamanho do pool via Smart Turbo.
 */
export async function runRangePool({
  ranges, url, fh, headers, signal, timeoutMs, validateMedia, total, tracker,
  resumeCtx, hardLimit, smartTurbo, onTurboDecision,
}) {
  let turboTimer = null;
  try {
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
  } finally {
    clearInterval(turboTimer);
  }
}
