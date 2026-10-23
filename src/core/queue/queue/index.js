/**
 * DownloadQueue factory (P7 / seção 10 do architect.md).
 *
 * Orquestra o DownloadEngine com limite de downloads simultaneos,
 * auto-start, cancelar/pausar/retomar/retry/remover/reordenar e
 * persistencia opcional com crash recovery.
 *
 * A ordem dos jobs e mantida pela propria fila (`state.order`),
 * independente do Map do engine, permitindo reordenacao sem tocar nele.
 *
 * Opcoes:
 *  - engine: DownloadEngine (obrigatorio)
 *  - maxConcurrent: limite de simultaneos (default 3)
 *  - storage: store JSON opcional para persistir a fila (crash recovery)
 *  - autoStart: comeca a processar automaticamente ao enfileirar (default true)
 *  - onEvent: callback opcional (event, payload) para a UI observar a fila
 */

import { createQueueContext, subscribeQueueEngine } from './context.js';
import { createJobsApi } from './jobs.js';
import { createPersistApi } from './persist-api.js';

const clampConcurrent = (value) => {
  const raw = Number(value);
  return Math.min(16, Math.max(1, Number.isFinite(raw) ? raw : 3));
};

export function createDownloadQueue({
  engine, maxConcurrent = 3, storage = null, autoStart = true, onEvent = null,
} = {}) {
  if (!engine) throw new TypeError('createDownloadQueue: engine e obrigatorio');

  const { state, emit, jobs, ctx, pump } = createQueueContext({
    engine, maxConcurrent: clampConcurrent(maxConcurrent), onEvent,
  });
  state.storage = storage;
  state.autoStart = autoStart;

  const disposeEngine = subscribeQueueEngine({ engine, state, emit, pump });

  const api = {
    engine,
    setMaxConcurrent(n) {
      const value = Number(n);
      if (!Number.isFinite(value)) return state.maxConcurrent;
      state.maxConcurrent = clampConcurrent(value);
      ctx.maxConcurrent = state.maxConcurrent;
      if (state.autoStart && !state.paused) pump();
      return state.maxConcurrent;
    },

    setPaused(value) {
      state.paused = Boolean(value);
      ctx._paused = state.paused;
      if (!state.paused) pump();
    },

    ...createJobsApi({ engine, state, jobs, pump }),
    ...createPersistApi({ engine, state, jobs, pump, disposeEngine }),
  };

  Object.defineProperty(api, 'maxConcurrent', {
    enumerable: true, configurable: true, get: () => state.maxConcurrent,
  });
  Object.defineProperty(api, 'paused', {
    enumerable: true, configurable: true, get: () => state.paused,
  });

  return api;
}
