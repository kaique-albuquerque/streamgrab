/**
 * Ações do gerenciador: enfileirar, cancelar, re-tentar e remover jobs.
 */

import { DEFAULT_MODEL, isKnownModel } from '../model-manager.js';
import { JOB_STATUS } from './constants.js';
import { clearRetryTimer, pump } from './engine.js';
import { snapshot } from './storage.js';

/** Enfileira um job. Validação de entrada é responsabilidade do chamador. */
export function enqueueJob(ctx, { videoPath, language = 'pt', formats = ['txt', 'md'], title = '', model = DEFAULT_MODEL } = {}) {
  ctx.idCounter++;
  const job = {
    jobId: `tr_${ctx.now().toString(36)}_${ctx.idCounter}`,
    videoPath,
    language,
    formats,
    title,
    // Ids desconhecidos caem no padrão: jobs antigos (sem `model`)
    // continuam retomáveis após crash recovery.
    model: isKnownModel(model) ? model : DEFAULT_MODEL,
    status: JOB_STATUS.QUEUED,
    attempts: 0,
    stage: 'queued',
    percent: 0,
    error: null,
    files: [],
    engine: '',
    createdAt: ctx.now(),
    startedAt: null,
    finishedAt: null,
    nextRetryAt: null,
  };
  ctx.jobs.set(job.jobId, job);
  ctx.order.push(job.jobId);
  ctx.emit('added', snapshot(job));
  ctx.persist();
  // Snapshot antes do pump: caller recebe o job como 'queued'.
  const queued = snapshot(job);
  pump(ctx);
  return queued;
}

/** Cancela um job (running → abort; queued → remove da fila). */
export function cancelJob(ctx, jobId) {
  const job = ctx.jobs.get(jobId);
  if (!job) return false;

  if (job.status === JOB_STATUS.RUNNING) {
    ctx.controllers.get(jobId)?.abort();
    return true;
  }

  clearRetryTimer(ctx, jobId);

  if (job.status === JOB_STATUS.QUEUED) {
    const idx = ctx.order.indexOf(jobId);
    if (idx >= 0) ctx.order.splice(idx, 1);
    job.status = JOB_STATUS.CANCELLED;
    job.finishedAt = ctx.now();
    job.error = 'Cancelado pelo usuário.';
    ctx.emit('cancelled', snapshot(job));
    ctx.persist();
    return true;
  }

  return false;
}

/** Re-enfileira um job cancelado ou com erro. */
export function retryJob(ctx, jobId) {
  const job = ctx.jobs.get(jobId);
  if (!job || ![JOB_STATUS.ERROR, JOB_STATUS.CANCELLED].includes(job.status)) return false;

  clearRetryTimer(ctx, jobId);

  job.status = JOB_STATUS.QUEUED;
  job.error = null;
  job.nextRetryAt = null;
  ctx.order.push(jobId);
  ctx.emit('added', snapshot(job));
  ctx.persist();
  pump(ctx);
  return true;
}

/**
 * Remove um job terminal (done/error/cancelled) da lista e da
 * persistência. Jobs em execução não podem ser removidos (cancele antes).
 */
export function removeJob(ctx, jobId) {
  const job = ctx.jobs.get(jobId);
  if (!job || job.status === JOB_STATUS.RUNNING) return false;

  const idx = ctx.order.indexOf(jobId);
  if (idx >= 0) ctx.order.splice(idx, 1);

  clearRetryTimer(ctx, jobId);

  ctx.jobs.delete(jobId);
  ctx.emit('removed', snapshot(job));
  ctx.persist();
  return true;
}
