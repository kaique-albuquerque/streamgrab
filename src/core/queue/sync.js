/**
 * DownloadQueue — engine subscription + pump context sync.
 *
 * Wires the pump context (shared between queue.js and pump.js) to the
 * local closure variables, and subscribes to engine terminal events.
 */

import { createPump } from './pump.js';

/**
 * Creates the pump context object and synchronizes its reactive
 * properties (`_paused`, `_draining`, `_pumpScheduled`, `maxConcurrent`)
 * with the closure variables in `queue.js` via `Object.defineProperty`.
 *
 * @returns {{ ctx: object, pump: Function }}
 */
export function createPumpSync({ engine, _order, _started, _running, orderedJobs, emit }) {
  // Shared state bag — pump.js reads/writes via these getters/setters
  const ctx = {
    engine, _order, _started, _running,
    _draining: false, _pumpScheduled: false, _paused: false,
    maxConcurrent: 3, orderedJobs, emit,
  };

  const pump = createPump(ctx);
  return { ctx, pump };
}

/**
 * Binds local closure variables to the pump context via live getters/setters
 * so pump.js and queue.js always see the same values.
 */
export function syncPumpFlags(ctx, locals) {
  for (const key of ['_paused', '_draining', '_pumpScheduled', 'maxConcurrent']) {
    Object.defineProperty(ctx, key, {
      get: () => locals[key],
      set: (v) => { locals[key] = v; },
    });
  }
}

/**
 * Subscribes to engine terminal events (complete/error/cancel).
 * When a job finishes, removes it from `_running` and triggers pump.
 *
 * @returns {Function} dispose — call to unsubscribe.
 */
export function subscribeEngine({ engine, _running, emit, _paused, pump }) {
  const offs = [];
  for (const event of ['complete', 'error', 'cancel']) {
    const handler = (payload) => {
      _running.delete(payload?.jobId);
      emit(event, payload);
      if (!_paused()) pump();
    };
    engine.on(event, handler);
    offs.push(() => engine.off(event, handler));
  }
  return () => { for (const off of offs) off(); };
}
