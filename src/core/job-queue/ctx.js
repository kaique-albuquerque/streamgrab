/**
 * Criação do `ctx` — o estado compartilhado da fila.
 *
 * `ctx` guarda os jobs, a ordem FIFO, os controllers de abort, os timers de
 * retry, o contador de execução e os injetáveis de domínio. O núcleo não
 * conhece campos de domínio: `createJob`, `createRunner` e `snapshotJob` são
 * fornecidos pelo wrapper.
 */

/**
 * Monta o `ctx` da fila.
 *
 * @param {object} params
 * @param {number} params.maxConcurrent
 * @param {number} params.maxRetries
 * @param {number} params.retryDelayMs
 * @param {object|null} params.storage
 * @param {Function} params.createJob - `createJob(ctx, params)` → job
 * @param {Function} params.createRunner - `createRunner(ctx)` → runner
 * @param {Function} params.snapshotJob - `snapshotJob(job)` → serializável
 * @param {Function|null} [params.runner] - Runner de domínio injetável; o
 *   `createRunner` do wrapper o lê de `ctx.runner` (undefined → usa o padrão)
 * @param {Function|null} params.onEvent
 * @param {() => number} params.now
 */
export function createCtx({
  maxConcurrent,
  maxRetries,
  retryDelayMs,
  storage,
  createJob,
  createRunner,
  snapshotJob,
  runner = null,
  onEvent,
  now,
}) {
  const ctx = {
    jobs: new Map(), // jobId → job
    order: [], // FIFO de jobIds 'queued'
    controllers: new Map(), // jobId → AbortController
    retryTimers: new Map(), // jobId → timer de retry
    concurrent: Math.max(1, Number(maxConcurrent) || 1),
    maxRetries,
    retryDelayMs,
    storage,
    createJob,
    createRunner,
    snapshotJob,
    runner,
    now,
    running: 0,
    idCounter: 0,

    emit(event, payload) {
      try {
        onEvent?.(event, payload);
      } catch {
        /* listener nunca derruba o fluxo */
      }
    },

    persist() {
      if (!storage?.save) return;
      storage.save([...ctx.jobs.values()].map((job) => ctx.snapshotJob(job)));
    },
  };

  return ctx;
}