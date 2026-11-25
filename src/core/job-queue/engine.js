/**
 * Execução de jobs e bombeamento da fila.
 *
 * O runner é obtido de `ctx.createRunner(ctx)` e recebe `{ job, signal,
 * onProgress, onLog }` — o núcleo não monta campos de domínio.
 */

import { JOB_STATUS } from './constants.js';

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

  ctx.emit('started', ctx.snapshotJob(job));
  ctx.persist();

  const activeRunner = ctx.createRunner(ctx);
  try {
    const result = await activeRunner({
      job,
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
    ctx.emit('done', ctx.snapshotJob(job));
  } catch (err) {
    const cancelled = controller.signal.aborted;
    if (cancelled) {
      job.status = JOB_STATUS.CANCELLED;
      job.finishedAt = ctx.now();
      job.error = 'Cancelado pelo usuário.';
      ctx.emit('cancelled', ctx.snapshotJob(job));
    } else if (job.attempts <= ctx.maxRetries) {
      // Retry com backoff progressivo (5s, 10s, ...).
      const delay = ctx.retryDelayMs * job.attempts;
      job.status = JOB_STATUS.QUEUED;
      job.nextRetryAt = ctx.now() + delay;
      ctx.emit('retry-scheduled', ctx.snapshotJob(job));
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
      ctx.emit('error', ctx.snapshotJob(job));
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