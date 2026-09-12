/**
 * P7 — DownloadQueue factory (src/core/queue/queue.js)
 *
 * Seção 10 do architect.md. Orquestra o DownloadEngine com:
 *  - limite de downloads simultaneos (maxConcurrent);
 *  - auto-start: enfileirou -> processa ate o limite;
 *  - cancelar / pausar / retomar / retry / remover / reordenar;
 *  - persistencia opcional (storage) com crash recovery.
 *
 * A ordem dos jobs e mantida pela propria fila (`_order`), independente do
 * Map do engine, permitindo reordenacao sem tocar no engine.
 */

import { RUNNING_STATES, TERMINAL_STATES, isNonTerminal } from './constants.js';
import { orderedJobs as _orderedJobs, seedOrder } from './ordering.js';
import { createPumpSync, subscribeEngine } from './sync.js';
import {
  createSnapshot, restoreSnapshot, persistSnapshot, loadFromStorage,
} from './persistence.js';

/**
 * Cria a fila de downloads.
 *
 * Opcoes:
 *  - engine: DownloadEngine (obrigatorio)
 *  - maxConcurrent: limite de simultaneos (default 3)
 *  - storage: store JSON opcional para persistir a fila (crash recovery)
 *  - autoStart: comeca a processar automaticamente ao enfileirar (default true)
 *  - onEvent: callback opcional (event, payload) para a UI observar a fila
 */
export function createDownloadQueue({
  engine, maxConcurrent = 3, storage = null, autoStart = true, onEvent = null,
} = {}) {
  if (!engine) throw new TypeError('createDownloadQueue: engine e obrigatorio');
  const raw = Number(maxConcurrent);
  maxConcurrent = Math.min(16, Math.max(1, Number.isFinite(raw) ? raw : 3));

  // -- shared state ---------------------------------------------------------
  const _started = new Set();
  const _running = new Map();
  const _order = [];
  let _paused = false;

  const emit = (event, payload) => {
    if (typeof onEvent === 'function') onEvent(event, payload);
  };

  // -- ordering / pump / engine wiring --------------------------------------
  const _jobs = () => _orderedJobs(_order, engine);
  const { ctx, pump } = createPumpSync({ engine, _order, _started, _running, orderedJobs: _jobs, emit });
  ctx.maxConcurrent = maxConcurrent;

  // Sync only flags that queue.js mutates and pump reads.
  // _draining and _pumpScheduled stay on ctx (pump owns them).
  Object.defineProperty(ctx, '_paused', {
    get: () => _paused,
    set: (v) => { _paused = v; },
  });
  Object.defineProperty(ctx, 'maxConcurrent', {
    get: () => maxConcurrent,
    set: (v) => { maxConcurrent = v; },
  });

  const disposeEngine = subscribeEngine({
    engine, _running, emit, _paused: () => _paused, pump,
  });

  // -- public API -----------------------------------------------------------
  return {
    engine,
    get maxConcurrent() { return maxConcurrent; },

    setMaxConcurrent(n) {
      const value = Number(n);
      if (!Number.isFinite(value)) return maxConcurrent;
      maxConcurrent = Math.min(16, Math.max(1, value));
      ctx.maxConcurrent = maxConcurrent;
      if (autoStart && !_paused) pump();
      return maxConcurrent;
    },

    get paused() { return _paused; },

    list() {
      return _jobs().filter(isNonTerminal);
    },

    all() {
      return _jobs().map((j) => ({ ...j, meta: { ...j.meta } }));
    },

    get(id) { return engine.getJob(id); },

    getOutputPath(id) {
      return engine.getJob(id)?.meta?.output || '';
    },

    enqueue(url, opts = {}) {
      const job = engine.enqueue(url, opts);
      _order.push(job.id);
      if (autoStart && !_paused) pump();
      return job;
    },

    pause(id) { return engine.pause(id); },
    resume(id) { return engine.resume(id); },
    cancel(id) { return engine.cancel(id); },

    setPaused(value) {
      _paused = Boolean(value);
      ctx._paused = _paused;
      if (!_paused) pump();
    },

    retry(id) {
      const job = engine.getJob(id);
      if (!job) {
        const err = new Error(`Job nao encontrado: ${id}`);
        err.code = 'JOB_NOT_FOUND';
        throw err;
      }
      if (!TERMINAL_STATES.has(job.state)) return job;
      return this.enqueue(job.url, {
        title: job.title,
        meta: { ...job.meta, retryOf: job.id },
      });
    },

    remove(id) {
      const job = engine.getJob(id);
      if (!job) {
        const err = new Error(`Job nao encontrado: ${id}`);
        err.code = 'JOB_NOT_FOUND';
        throw err;
      }
      if (!TERMINAL_STATES.has(job.state)) engine.cancel(id);
      engine.remove(id);
      const idx = _order.indexOf(job.id);
      if (idx !== -1) _order.splice(idx, 1);
      _started.delete(job.id);
      _running.delete(job.id);
      return this;
    },

    reorder(fromIndex, toIndex) {
      seedOrder(_order, engine);
      const jobs = _jobs();
      const active = jobs.filter((j) => RUNNING_STATES.has(j.state));
      if (active.length > 0) {
        const err = new Error('Nao e possivel reordenar com downloads em andamento.');
        err.code = 'QUEUE_BUSY';
        throw err;
      }
      const ids = jobs.map((j) => j.id);
      if (fromIndex < 0 || fromIndex >= ids.length || toIndex < 0 || toIndex >= ids.length) {
        const err = new Error(`Indices invalidos: ${fromIndex} -> ${toIndex}`);
        err.code = 'INVALID_INDEX';
        throw err;
      }
      const [moved] = ids.splice(fromIndex, 1);
      ids.splice(toIndex, 0, moved);
      _order.length = 0;
      _order.push(...ids);
      return this.list();
    },

    // -- persistencia / crash recovery --------------------------------------
    snapshot() { return createSnapshot(_jobs); },

    restore(snapshot) {
      restoreSnapshot(engine, snapshot, _order);
      return this;
    },

    save() {
      return persistSnapshot(storage, createSnapshot(_jobs));
    },

    async load() {
      const data = loadFromStorage(storage);
      restoreSnapshot(engine, data, _order);
      if (autoStart && !_paused) pump();
      return this;
    },

    dispose() {
      disposeEngine();
      _order.length = 0;
      _running.clear();
      _started.clear();
    },
  };
}
