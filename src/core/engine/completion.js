/**
 * DownloadEngine — terminal state handling (complete, fail, history, cleanup).
 */

import fs from 'node:fs';

import { setJobTaskState, transitionJob } from '../models/index.js';
import { classifyError, CancelledError } from '../errors.js';
import { defaultStatePath, clearState } from '../resume.js';

/**
 * Marks a job as completed, clears resume state, records history, emits event.
 */
export function complete(engine, job) {
  setJobTaskState(job, 'completed');
  transitionJob(job, 'completed');
  job._downloadedAt = Date.now();
  if (job.meta?.output) {
    clearState(defaultStatePath(job.meta.output)).catch(() => {});
  }
  recordHistory(engine, job, { status: 'completed' });
  engine._emit('complete', {
    jobId: job.id,
    stage: 'completed',
    percent: 100,
    message: `Download concluido: ${job.meta.output}`,
    output: job.meta.output || '',
  });
}

/**
 * Classifies an error, transitions to failed/cancelled, cleans up, emits event.
 * Re-throws the classified error so the caller can propagate it.
 */
export function handleFailure(engine, job, err) {
  const classified = classifyError(err);
  if (classified instanceof CancelledError) {
    transitionJob(job, 'cancelled', { error: classified });
    cleanupPartial(job.meta.output);
    recordHistory(engine, job, { status: 'cancelled' });
    engine._emit('cancel', { jobId: job.id, stage: 'cancelled', message: 'Download cancelado.' });
    return;
  }
  transitionJob(job, 'failed', { error: classified });
  cleanupPartial(job.meta.output);
  recordHistory(engine, job, { status: 'failed' });
  engine._emit('error', {
    jobId: job.id,
    stage: 'failed',
    message: classified.friendlyMessage || classified.message,
    code: classified.code || '',
    suggestedAction: classified.suggestedAction || '',
    detail: classified.detail || '',
    status: classified.status || 0,
  });
  throw classified;
}

/**
 * Records a completed/failed/cancelled job into the history store.
 */
export function recordHistory(engine, job, { status }) {
  if (!engine.history || typeof engine.history.add !== 'function') return;
  try {
    let size = 0;
    const out = job.meta?.output;
    if (out && fs.existsSync(out)) {
      try { size = fs.statSync(out).size; } catch { size = 0; }
    }
    engine.history.add({
      title: job.title || job.url,
      url: job.url,
      provider: job._sourceType || job.meta?.sourceType || '',
      format: job.meta?.format || job.meta?.chosenFormat || '',
      destination: job.meta?.output || '',
      status,
      size,
      durationMs: job._startedAt ? Math.max(0, Date.now() - job._startedAt) : 0,
    });
  } catch {
    /* historico nunca derruba o download */
  }
}

/**
 * Removes a partial output file and its resume state.
 */
export function cleanupPartial(output) {
  try {
    if (output && fs.existsSync(output)) fs.unlinkSync(output);
  } catch { /* ignora */ }
  if (output) clearState(defaultStatePath(output)).catch(() => {});
}
