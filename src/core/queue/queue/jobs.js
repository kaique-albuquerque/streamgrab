/**
 * DownloadQueue — operacoes sobre jobs: consulta, enfileirar, cancelar,
 * retry, remover e reordenar.
 */

import { RUNNING_STATES, TERMINAL_STATES, isNonTerminal } from '../constants.js';
import { seedOrder } from '../ordering.js';

function jobNotFound(id) {
  const err = new Error(`Job nao encontrado: ${id}`);
  err.code = 'JOB_NOT_FOUND';
  return err;
}

export function createJobsApi({ engine, state, jobs, pump }) {
  const maybePump = () => {
    if (state.autoStart && !state.paused) pump();
  };

  return {
    list() {
      return jobs().filter(isNonTerminal);
    },

    all() {
      return jobs().map((j) => ({ ...j, meta: { ...j.meta } }));
    },

    get(id) { return engine.getJob(id); },

    getOutputPath(id) {
      return engine.getJob(id)?.meta?.output || '';
    },

    enqueue(url, opts = {}) {
      const job = engine.enqueue(url, opts);
      state.order.push(job.id);
      maybePump();
      return job;
    },

    pause(id) { return engine.pause(id); },
    resume(id) { return engine.resume(id); },
    cancel(id) { return engine.cancel(id); },

    retry(id) {
      const job = engine.getJob(id);
      if (!job) throw jobNotFound(id);
      if (!TERMINAL_STATES.has(job.state)) return job;
      return this.enqueue(job.url, {
        title: job.title,
        meta: { ...job.meta, retryOf: job.id },
      });
    },

    remove(id) {
      const job = engine.getJob(id);
      if (!job) throw jobNotFound(id);
      if (!TERMINAL_STATES.has(job.state)) engine.cancel(id);
      engine.remove(id);
      const idx = state.order.indexOf(job.id);
      if (idx !== -1) state.order.splice(idx, 1);
      state.started.delete(job.id);
      state.running.delete(job.id);
      return this;
    },

    reorder(fromIndex, toIndex) {
      seedOrder(state.order, engine);
      const ordered = jobs();
      const active = ordered.filter((j) => RUNNING_STATES.has(j.state));
      if (active.length > 0) {
        const err = new Error('Nao e possivel reordenar com downloads em andamento.');
        err.code = 'QUEUE_BUSY';
        throw err;
      }
      const ids = ordered.map((j) => j.id);
      if (fromIndex < 0 || fromIndex >= ids.length || toIndex < 0 || toIndex >= ids.length) {
        const err = new Error(`Indices invalidos: ${fromIndex} -> ${toIndex}`);
        err.code = 'INVALID_INDEX';
        throw err;
      }
      const [moved] = ids.splice(fromIndex, 1);
      ids.splice(toIndex, 0, moved);
      state.order.length = 0;
      state.order.push(...ids);
      return this.list();
    },
  };
}
