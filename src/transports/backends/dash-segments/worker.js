/**
 * DASH segments — worker loop and adaptive scheduling.
 */

import { downloadRepresentation } from './helpers.js';

/**
 * Creates the worker loop function for downloading representations.
 *
 * @param {object} state — shared mutable state bag
 * @returns {Function} workerLoop(id) -> Promise<void>
 */
export function createWorkerLoop(state) {
  return async function workerLoop(id) {
    state.running++;
    try {
      while (!state.signal?.aborted && id < state.desired) {
        const current = state.pendingQueue[state.cursor++];
        if (!current) return;
        const startedAt = Date.now();
        const checkpointId = current.checkpointId;
        state.representationStatuses.set(checkpointId, 'downloading');
        try {
          const download = await downloadRepresentation(
            current.rep, state.manifestBase, state.headers,
            state.workDir, current.kind, state.signal
          );
          state.results.set(current.kind, download);
          state.totalBytes += download.bytes;
          state.completedSegmentIds.add(checkpointId);
          state.representationStatuses.set(checkpointId, 'completed');
          state.windowBytes += download.bytes;
          state.windowLatencyMs += Date.now() - startedAt;
          state.windowRequests++;
          state.done++;
          state.emitCheckpoint({
            taskState: state.done >= state.total ? 'downloaded' : 'downloading',
            diagnostics: {
              videoRepresentationId: state.videoRep.id || '',
              audioRepresentationId: state.audioRep?.id || '',
              totalBytes: state.totalBytes,
            },
          });
          state.onProgress?.({
            done: state.done, total: state.total,
            totalBytes: state.totalBytes, failed: 0,
            queue: current.kind, concurrency: state.desired,
          });
        } catch (err) {
          state.windowErrors++;
          state.windowLatencyMs += Date.now() - startedAt;
          state.windowRequests++;
          state.representationStatuses.set(checkpointId, 'pending');
          throw err;
        }
      }
    } finally {
      state.running--;
    }
  };
}

/**
 * Creates the spawn function that manages worker concurrency.
 */
export function createSpawnManager(state) {
  const workers = new Set();

  function spawnWorker() {
    const id = workers.size;
    const p = state.workerLoop(id);
    const tracked = p.finally(() => workers.delete(tracked));
    workers.add(tracked);
  }

  function spawnAvailable() {
    const toSpawn = Math.max(0, state.desired - state.running);
    for (let i = 0; i < toSpawn && state.cursor < state.pendingQueue.length; i++) {
      spawnWorker();
    }
  }

  return { workers, spawnWorker, spawnAvailable };
}

/**
 * Flushes the adaptive controller sampling window.
 */
export function flushAdaptiveWindow(state, controller, onAdaptiveDecision, onProgress) {
  if (!controller) return;
  const elapsed = Date.now() - state.windowStart;
  if (elapsed <= 0) return;
  const decision = controller.sample({
    bytes: state.windowBytes,
    elapsedMs: elapsed,
    errors: state.windowErrors,
    concurrency: state.running,
    latencyMs: state.windowLatencyMs,
    requests: state.windowRequests,
    schedulerLimits: {
      downloadLimit: state.pendingQueue.length || state.queueLength,
      hostLimit: state.pendingQueue.length || state.queueLength,
      globalLimit: null,
    },
  });
  state.windowBytes = 0;
  state.windowErrors = 0;
  state.windowLatencyMs = 0;
  state.windowRequests = 0;
  state.windowStart = Date.now();
  state.desired = controller.getConcurrency();
  onAdaptiveDecision?.(decision);
  onProgress?.({
    done: state.done, total: state.total,
    totalBytes: state.totalBytes, failed: 0,
    concurrency: state.desired, adaptiveDecision: decision,
  });
}
