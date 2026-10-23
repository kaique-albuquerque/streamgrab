/** Orquestrador do download paralelo por HTTP Range. */

import fs from 'node:fs';
import { CancelledError } from '../../../core/errors.js';
import { createState, saveState, clearState } from '../../../core/resume.js';
import { prepareRangePlan } from './setup.js';
import { createResumeContext, createTracker } from './persist.js';
import { runRangePool } from './pool.js';

/**
 * Baixa `url` em partes paralelas via HTTP Range com resume e Smart Turbo.
 */
export async function downloadParallelRanges({
  url, output, headers = {}, signal, onProgress,
  chunkCount, blockCount, concurrency, timeoutMs = 0,
  validateMedia = true, resume = true, smartTurbo, onTurboDecision,
  statePath, onExpiredUrl, onResume,
} = {}) {
  const plan = await prepareRangePlan({
    url, output, headers, signal, timeoutMs, chunkCount, blockCount, concurrency,
    resume, statePath, onExpiredUrl, onResume,
  });
  ({ url } = plan);
  const { total, fileMode, resumedBytes, sp, desiredConcurrency } = plan;
  let { state, ranges } = plan;

  const fh = await fs.promises.open(output, fileMode);
  if (fileMode === 'w') await fh.truncate(total);
  if (resume && !state) {
    state = createState({
      url, destination: output, totalSize: plan.probe.total,
      etag: plan.probe.etag, lastModified: plan.probe.lastModified,
      chunks: ranges.map((r) => ({ ...r, downloaded: 0, completed: false })),
    });
    await saveState(sp, state);
  }

  const started = Date.now();
  const tracker = createTracker({ downloaded: resumedBytes, started, onProgress });
  const resumeCtx = createResumeContext({ sp, state, resume });

  try {
    const hardLimit = Math.min(desiredConcurrency, ranges.length);
    await runRangePool({
      ranges, url, fh, headers, signal, timeoutMs, validateMedia, total, tracker,
      resumeCtx, hardLimit, smartTurbo, onTurboDecision,
    });
    if (resume && state) await clearState(sp);
    return { ok: true, bytesDownloaded: tracker.downloaded, totalBytes: total };
  } catch (err) {
    if (signal?.aborted) throw new CancelledError('Operacao cancelada.');
    throw err;
  } finally {
    await fh.close().catch(() => {});
  }
}
