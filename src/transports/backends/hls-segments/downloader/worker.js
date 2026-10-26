/**
 * Workers concorrentes que baixam os segmentos pendentes.
 */

import fs from 'node:fs';

import { fetchBinary } from '../fetch.js';
import { SEGMENT_ATTEMPTS } from '../inspect.js';

/**
 * Cria o gerenciador de workers.
 *
 * @param {Object} opts
 * @param {Object} opts.state - Estado compartilhado do downloader
 * @param {string} opts.headers - Request headers
 * @param {AbortSignal} opts.signal - Abort signal
 * @param {Function} [opts.onProgress] - Callback de progresso
 * @param {Function} opts.emitCheckpoint - Emissor de checkpoint
 * @param {Object} opts.diagnostics - Contagens base para o checkpoint
 */
export function createWorkers({
  state, headers, signal, onProgress, emitCheckpoint, diagnostics,
}) {
  const downloadSegment = async (item) => {
    let ok = false;
    for (let attempt = 1; attempt <= SEGMENT_ATTEMPTS && !ok; attempt++) {
      const startedAt = Date.now();
      try {
        const r = await fetchBinary(item.url, headers, signal);
        fs.writeFileSync(item.local, r.data);
        state.totalBytes += r.data.length;
        state.segMap.set(item.url, item.local);
        state.completedSegmentIds.add(item.segmentId);
        state.segmentStatuses.set(item.segmentId, 'completed');
        state.window.bytes += r.data.length;
        state.window.latencyMs += Date.now() - startedAt;
        state.window.requests++;
        ok = true;
      } catch {
        state.window.latencyMs += Date.now() - startedAt;
        state.window.requests++;
        state.window.errors++;
        if (attempt >= SEGMENT_ATTEMPTS) {
          state.failed++;
          state.segmentStatuses.set(item.segmentId, 'pending');
        }
      }
    }
  };

  const workerLoop = async (id) => {
    state.running++;
    try {
      while (!signal?.aborted && id < state.desired) {
        const current = state.pendingQueue[state.cursor++];
        if (!current) return;
        state.segmentStatuses.set(current.segmentId, 'downloading');
        await downloadSegment(current);
        state.done++;
        emitCheckpoint({
          taskState: state.done >= state.total && state.failed === 0 ? 'downloaded' : 'downloading',
          completedSegmentIds: [...state.completedSegmentIds],
          segmentStatuses: state.segmentStatuses,
          diagnostics: {
            ...diagnostics,
            totalBytes: state.totalBytes,
            failed: state.failed,
            resumedSegmentCount: state.completedSegmentIds.size,
          },
        });
        onProgress?.({
          done: state.done,
          total: state.total,
          totalBytes: state.totalBytes,
          failed: state.failed,
          concurrency: state.desired,
        });
      }
    } finally {
      state.running--;
    }
  };

  function spawnWorker() {
    const id = state.nextWorkerId++;
    const p = workerLoop(id);
    const tracked = p.finally(() => state.workers.delete(tracked));
    state.workers.add(tracked);
  }

  const spawnAvailableWorkers = () => {
    const toSpawn = Math.max(0, state.desired - state.running);
    for (let i = 0; i < toSpawn && state.cursor < state.pendingQueue.length; i++) spawnWorker();
  };

  const waitAll = async () => {
    while (state.workers.size > 0) {
      await Promise.all([...state.workers]);
      spawnAvailableWorkers();
    }
  };

  return { spawnAvailableWorkers, waitAll };
}
