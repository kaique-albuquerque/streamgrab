/**
 * Núcleo genérico de fila de jobs — concorrência, retry, cancelamento,
 * persistência e recuperação de crash.
 *
 * Não conhece nenhum domínio: quem cria o job (`createJob`), quem executa
 * (`createRunner`) e quem serializa (`snapshotJob`) são injetáveis. O núcleo
 * cuida de `ctx.jobs`, `ctx.order`, `ctx.controllers`, `ctx.retryTimers`,
 * `running`, `persist`, `emit` e do bombeamento da fila.
 *
 * Contrato dos injetáveis:
 *  - `createJob(ctx, params)` → objeto de job completo, com `jobId`.
 *  - `createRunner(ctx)` → `async ({ job, signal, onProgress, onLog }) => result`.
 *  - `snapshotJob(job)` → objeto serializável (sem refs de runtime).
 *
 * Uso:
 *   const queue = createJobQueue({ createJob, createRunner, snapshotJob, storage });
 *   queue.load();
 *   const job = queue.enqueue({ ... });
 *   queue.cancel(job.jobId);
 */

import { createManagerApi } from './job-queue/api.js';
import { createCtx } from './job-queue/ctx.js';

export { JOB_STATUS } from './job-queue/constants.js';
export { createJsonJobStorage } from './job-queue/storage.js';

/**
 * Cria a fila de jobs.
 *
 * @param {object} [options]
 * @param {number} [options.maxConcurrent=1] - Jobs simultâneos máximo
 * @param {number} [options.maxRetries=2] - Retries por job (além da 1ª tentativa)
 * @param {number} [options.retryDelayMs=5000] - Backoff base entre retries
 * @param {{ load(): object[], save(jobs: object[]): void } | null} [options.storage]
 * @param {Function} [options.runner] - Runner de domínio injetável (lido de
 *   `ctx.runner` pelo `createRunner` do wrapper)
 * @param {Function} [options.createJob] - `createJob(ctx, params)` → job
 * @param {Function} [options.createRunner] - `createRunner(ctx)` → runner
 * @param {Function} [options.snapshotJob] - `snapshotJob(job)` → serializável
 * @param {Function} [options.onEvent] - Callback (event, payload)
 * @param {() => number} [options.now] - Relógio injetável (testes)
 */
export function createJobQueue({
  maxConcurrent = 1,
  maxRetries = 2,
  retryDelayMs = 5_000,
  storage = null,
  runner = null,
  createJob,
  createRunner,
  snapshotJob,
  onEvent = null,
  now = Date.now,
} = {}) {
  if (typeof createJob !== 'function') {
    throw new TypeError('createJobQueue: createJob é obrigatório');
  }
  if (typeof createRunner !== 'function') {
    throw new TypeError('createJobQueue: createRunner é obrigatório');
  }
  if (typeof snapshotJob !== 'function') {
    throw new TypeError('createJobQueue: snapshotJob é obrigatório');
  }

  const ctx = createCtx({
    maxConcurrent,
    maxRetries,
    retryDelayMs,
    storage,
    runner,
    createJob,
    createRunner,
    snapshotJob,
    onEvent,
    now,
  });

  return createManagerApi(ctx);
}

export default createJobQueue;