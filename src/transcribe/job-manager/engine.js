/**
 * Execução de jobs e bombeamento da fila.
 */

import { DEFAULT_MODEL } from '../model-manager.js';
import { JOB_STATUS, defaultRunner } from './constants.js';
import { snapshot } from './storage.js';

/** Cancela (se existir) o timer de retry pendente de um job. */
export function clearRetryTimer(ctx, jobId) {
  const retryTimer = ctx.retryTimers.get(jobId);
  if (!retryTimer) return;
  clearTimeout(retryTimer);
  ctx.retryTimers.delete(jobId);
}

/** Executa um job (runner + retry/cancel) e bombeia a fila ao finalizar. */
export async function startJob(ctx, job) {
  ctx.running++;
  job.status = JOB_STATUS.RUNNING;
  job.startedAt = ctx.now();
  job.finishedAt = null;
  job.attempts++;
  job.stage = 'preparing';
  job.percent = 0;
  job.error = null;
  job.nextRetryAt = null;

  const controller = new AbortController();
  ctx.controllers.set(job.jobId, controller);

  ctx.emit('started', snapshot(job));
  ctx.persist();

  const activeRunner = ctx.runner || defaultRunner;
  try {
    const result = await activeRunner({
      videoPath: job.videoPath,
      language: job.language,
      formats: job.formats,
      title: job.title || undefined,
      model: job.model || DEFAULT_MODEL,
      signal: controller.signal,
      onProgress: (progress) => {
        job.stage = progress.stage || job.stage;
        if (typeof progress.percent === 'number') job.percent = progress.percent;
        ctx.emit('progress', { jobId: job.jobId, ...progress });
      },
      onLog: (line) => ctx.emit('log', { jobId: job.jobId, line }),
    });

    job.status = JOB_STATUS.DONE;
    job.stage = 'done';
    job.percent = 100;
    job.finishedAt = ctx.now();
    job.files = result?.files || [];
    job.engine = result?.engine || '';
    ctx.emit('done', snapshot(job));
  } catch (err) {
    const cancelled = controller.signal.aborted;
    if (cancelled) {
      job.status = JOB_STATUS.CANCELLED;
      job.finishedAt = ctx.now();
      job.error = 'Cancelado pelo usuário.';
      ctx.emit('cancelled', snapshot(job));
    } else if (job.attempts <= ctx.maxRetries) {
      // Retry com backoff progressivo (5s, 10s, ...).
      const delay = ctx.retryDelayMs * job.attempts;
      job.status = JOB_STATUS.QUEUED;
      job.nextRetryAt = ctx.now() + delay;
      ctx.emit('retry-scheduled', snapshot(job));
      const timer = setTimeout(() => {
        ctx.retryTimers.delete(job.jobId);
        ctx.order.push(job.jobId);
        pump(ctx);
      }, delay);
      timer.unref?.();
      ctx.retryTimers.set(job.jobId, timer);
    } else {
      job.status = JOB_STATUS.ERROR;
      job.finishedAt = ctx.now();
      job.error = err?.message || String(err);
      ctx.emit('error', snapshot(job));
    }
  } finally {
    ctx.running--;
    ctx.controllers.delete(job.jobId);
    ctx.persist();
    pump(ctx);
  }
}

/** Bombeia a fila: inicia jobs 'queued' enquanto houver vaga. */
export function pump(ctx) {
  while (ctx.running < ctx.concurrent) {
    const jobId = ctx.order.shift();
    if (!jobId) break;
    const job = ctx.jobs.get(jobId);
    if (!job || job.status !== JOB_STATUS.QUEUED) continue;
    startJob(ctx, job);
  }
}
