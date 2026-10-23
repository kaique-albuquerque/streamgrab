/**
 * Loop de download com pausa/retomada e refresh de plano.
 */

import { setJobTaskState, transitionJob } from '../../models/index.js';
import { CancelledError } from '../../errors.js';
import { normalizeHeaders } from '../../../utils.js';
import { mergeRequestContext } from '../../request-context.js';
import { headersFromRequestContext } from '../helpers.js';
import { tryRefreshPlan } from './refresh.js';

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
      await waitForResume(engine, job);
      continue;
    }
    if (result?.cancelled) throw new CancelledError('Download cancelado.');
    if (!result?.ok) {
      const err = failureFromResult(result);
      const refreshed = await tryRefreshPlan({ engine, job, adapter, prepared, err, refreshCount });
      if (refreshed) {
        prepared = refreshed;
        refreshCount += 1;
        continue;
      }
      throw err;
    }
    break;
  }
}

/** Marca o job como pausado e espera o sinal de retomada. */
async function waitForResume(engine, job) {
  transitionJob(job, 'paused');
  engine._emit('pause', { jobId: job.id, stage: 'paused', message: 'Download pausado' });
  await new Promise((resolve) => {
    const entry = engine._active.get(job.id);
    if (entry) entry.resume = resolve;
  });
}

/** Converte o resultado malsucedido do executor em Error enriquecido. */
function failureFromResult(result) {
  const err = new Error(result?.error || 'Falha no download.');
  err.code = result?.code || 'DOWNLOAD_FAILED';
  err.status = result?.status || 0;
  err.detail = result?.detail || '';
  return err;
}
