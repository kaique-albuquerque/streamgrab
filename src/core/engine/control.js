/**
 * DownloadEngine — pause/resume/cancel/dispose + progress helper.
 */

import { setJobTaskState, transitionJob, isTerminalJobState, serializeJob } from '../models/index.js';
import { createProgressPayload } from '../events.js';
import { CancelledError } from '../errors.js';

/**
 * Pauses an active download by aborting the current attempt.
 */
export function pause(engine, id) {
  const job = engine._jobs.get(String(id));
  if (!job) {
    const err = new Error(`Job nao encontrado: ${id}`);
    err.code = 'JOB_NOT_FOUND';
    throw err;
  }
  if (job.state === 'downloading') {
    engine._active.get(job.id)?.attempt.abort('pause');
  }
  return serializeJob(job);
}

/**
 * Resumes a paused download.
 */
export function resume(engine, id) {
  const job = engine._jobs.get(String(id));
  if (!job) {
    const err = new Error(`Job nao encontrado: ${id}`);
    err.code = 'JOB_NOT_FOUND';
    throw err;
  }
  if (job.state === 'paused') {
    engine._active.get(job.id)?.resume?.();
  }
  return serializeJob(job);
}

/**
 * Cancels a job (queued/paused/downloading/analyzing/preparing).
 */
export function cancel(engine, id) {
  const job = engine._jobs.get(String(id));
  if (!job) {
    const err = new Error(`Job nao encontrado: ${id}`);
    err.code = 'JOB_NOT_FOUND';
    throw err;
  }
  if (isTerminalJobState(job.state)) return serializeJob(job);
  job._cancelRequested = true;
  const entry = engine._active.get(job.id);
  if (job.state === 'queued') {
    transitionJob(job, 'cancelled', { error: new CancelledError('Download cancelado.') });
    engine._emit('cancel', { jobId: job.id, stage: 'cancelled', message: 'Download cancelado.' });
  } else if (job.state === 'paused') {
    entry?.resume?.();
  } else {
    entry?.attempt.abort('cancel');
  }
  return serializeJob(job);
}

/**
 * Disposes the engine: aborts all active downloads.
 */
export function dispose(engine) {
  for (const [, entry] of engine._active) {
    entry.attempt.abort('cancel');
    entry.resume?.();
  }
  engine._active.clear();
}

// -- helpers ----------------------------------------------------------------

/**
 * Checks if the current job attempt has been aborted.
 */
export function isAborted(engine, job) {
  return Boolean(engine._active.get(job.id)?.attempt?.signal.aborted);
}

/**
 * Creates a throttled progress callback that emits progress/speed/eta events.
 */
export function makeProgress(engine, job) {
  let lastEmit = 0;
  return (update = {}) => {
    const now = Date.now();
    if (now - lastEmit < engine.progressThrottleMs) return;
    lastEmit = now;
    const clean = {};
    for (const [k, v] of Object.entries(update)) {
      if (v !== undefined) clean[k] = v;
    }
    if (clean.stage === 'merging') {
      if (!job.meta.downloadedAt) job.meta.downloadedAt = new Date(now).toISOString();
      if (job.meta.taskState !== 'processing' && job.meta.taskState !== 'completed') {
        setJobTaskState(job, 'processing');
      }
    }
    const payload = createProgressPayload({ ...clean, jobId: job.id, stage: clean.stage || 'downloading' });
    engine._emit('progress', payload);
    if (clean.speed != null) engine._emit('speed', { jobId: job.id, speed: clean.speed });
    if (clean.etaSeconds != null) engine._emit('eta', { jobId: job.id, etaSeconds: clean.etaSeconds });
  };
}
