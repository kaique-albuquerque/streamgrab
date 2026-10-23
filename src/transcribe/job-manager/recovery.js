/**
 * Crash recovery (carregar jobs persistidos) e descarte do gerenciador.
 */

import { JOB_STATUS } from './constants.js';
import { pump } from './engine.js';
import { snapshot } from './storage.js';

/**
 * Carrega jobs persistidos. Jobs 'running' (crash recovery) voltam
 * como 'queued' e são reprocessados.
 */
export function loadJobs(ctx) {
  if (!ctx.storage?.load) return [];
  const restored = [];
  for (const data of ctx.storage.load()) {
    if (!data?.jobId || ctx.jobs.has(data.jobId)) continue;
    const status = data.status === JOB_STATUS.RUNNING ? JOB_STATUS.QUEUED : data.status;
    if (![JOB_STATUS.QUEUED, JOB_STATUS.ERROR, JOB_STATUS.CANCELLED, JOB_STATUS.DONE].includes(status)) {
      continue;
    }
    const job = {
      ...data,
      status,
      stage: status === JOB_STATUS.QUEUED ? 'queued' : data.stage,
      error: status === JOB_STATUS.QUEUED ? null : data.error,
      nextRetryAt: null,
    };
    ctx.jobs.set(job.jobId, job);
    if (status === JOB_STATUS.QUEUED) ctx.order.push(job.jobId);
    restored.push(snapshot(job));
  }
  if (restored.length) {
    ctx.persist();
    pump(ctx);
  }
  return restored;
}

/** Limpa timers e aborta jobs em execução. */
export function disposeManager(ctx) {
  for (const timer of ctx.retryTimers.values()) clearTimeout(timer);
  ctx.retryTimers.clear();
  for (const controller of ctx.controllers.values()) controller.abort();
  ctx.controllers.clear();
}
