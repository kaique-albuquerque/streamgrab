/**
 * DownloadQueue — estado compartilhado (order/running/started/paused/limite)
 * e ponte com o pump.
 */

import { orderedJobs } from '../ordering.js';
import { createPumpSync, subscribeEngine } from '../sync.js';

/** Cria o estado da fila, o ctx do pump e a funcao de pump. */
export function createQueueContext({ engine, maxConcurrent, onEvent }) {
  const state = {
    started: new Set(),
    running: new Map(),
    order: [],
    paused: false,
    maxConcurrent,
  };

  const emit = typeof onEvent === 'function'
    ? (event, payload) => onEvent(event, payload)
    : () => {};

  const jobs = () => orderedJobs(state.order, engine);
  const { ctx, pump } = createPumpSync({
    engine,
    _order: state.order,
    _started: state.started,
    _running: state.running,
    orderedJobs: jobs,
    emit,
  });

  // Apenas as flags mutadas pela factory sao espelhadas; _draining e
  // _pumpScheduled continuam com o pump.
  Object.defineProperty(ctx, '_paused', {
    get: () => state.paused,
    set: (v) => { state.paused = v; },
  });
  Object.defineProperty(ctx, 'maxConcurrent', {
    get: () => state.maxConcurrent,
    set: (v) => { state.maxConcurrent = v; },
  });

  return { state, emit, jobs, ctx, pump };
}

/** Assina os eventos terminais do engine para liberar vagas do pump. */
export function subscribeQueueEngine({ engine, state, emit, pump }) {
  return subscribeEngine({
    engine,
    _running: state.running,
    emit,
    _paused: () => state.paused,
    pump,
  });
}
