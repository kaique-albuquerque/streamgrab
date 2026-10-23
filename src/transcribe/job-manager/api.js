/**
 * API pública do gerenciador (fachada das ações).
 */

import { cancelJob, enqueueJob, removeJob, retryJob } from './actions.js';
import { pump } from './engine.js';
import { disposeManager, loadJobs } from './recovery.js';
import { snapshot } from './storage.js';

/** Cria a API pública do gerenciador. */
export function createManagerApi(ctx) {
  return {
    /** Enfileira um job. Validação de entrada é responsabilidade do chamador. */
    enqueue(params) {
      return enqueueJob(ctx, params);
    },

    /** Cancela um job (running → abort; queued → remove da fila). */
    cancel(jobId) {
      return cancelJob(ctx, jobId);
    },

    /** Re-enfileira um job cancelado ou com erro. */
    retry(jobId) {
      return retryJob(ctx, jobId);
    },

    /**
     * Remove um job terminal (done/error/cancelled) da lista e da
     * persistência. Jobs em execução não podem ser removidos (cancele antes).
     */
    remove(jobId) {
      return removeJob(ctx, jobId);
    },

    /** Lista snapshots de todos os jobs da sessão. */
    list() {
      return [...ctx.jobs.values()].map(snapshot);
    },

    /** Aplica novo limite de concorrência em tempo de execução. */
    setMaxConcurrent(n) {
      const value = Number(n);
      if (Number.isFinite(value) && value >= 1) {
        ctx.concurrent = Math.floor(value);
        pump(ctx);
      }
      return ctx.concurrent;
    },

    /** Carrega jobs persistidos, retomando os que ficaram 'running'. */
    load() {
      return loadJobs(ctx);
    },

    /** Limpa timers e aborta jobs em execução. */
    dispose() {
      disposeManager(ctx);
    },
  };
}
