/**
 * HLS segments — concurrent segment download worker with adaptive control.
 */

import fs from 'node:fs';

import { createAdaptiveController, normalizeAdaptiveControllerOptions } from '../../adaptive-controller.js';
import { createSegmentTaskId } from '../../../core/models/index.js';

import { fetchBinary } from './fetch.js';
import { SEGMENT_WORKERS, SEGMENT_ATTEMPTS } from './inspect.js';

/**
 * Runs the concurrent segment download loop.
 *
 * @param {Object} opts
 * @param {Array} opts.queue - Segment queue items
 * @param {Set} opts.completedSegmentIds - Already completed IDs
 * @param {Map} opts.segmentStatuses - Status per segment ID
 * @param {Map} opts.segMap - URL -> local path map
 * @param {string} opts.mediaBase - Base URL for segments
 * @param {object[]} opts.parsedSegments - Parsed segment metadata
 * @param {object[]} opts.parsedKeys - Parsed key metadata
 * @param {object[]} opts.parsedMaps - Parsed map metadata
 * @param {string} opts.headers - Request headers
 * @param {AbortSignal} opts.signal - Abort signal
 * @param {Function} opts.onProgress - Progress callback
 * @param {Function} opts.onAdaptiveDecision - Adaptive decision callback
 * @param {Function} opts.emitCheckpoint - Checkpoint emission function
 * @param {string} opts.preferredVariantPath - Preferred variant path
 * @param {object} opts.adaptive - Adaptive controller options
 * @returns {{ totalBytes: number, failed: number, cancelled: boolean, adaptive: object }}
 */
export async function runSegmentDownloader({
  queue, completedSegmentIds, segmentStatuses, segMap,
  mediaBase, parsedSegments, parsedKeys, parsedMaps,
  headers, signal, onProgress, onAdaptiveDecision, emitCheckpoint,
  preferredVariantPath, adaptive,
}) {
  const total = queue.length;
  let totalBytes = 0;
  let done = 0;
  let failed = 0;
  let cursor = 0;
  const pendingQueue = [];

  // Resume from checkpoint
  for (const item of queue) {
    if (completedSegmentIds.has(item.segmentId) && fs.existsSync(item.local)) {
      totalBytes += fs.statSync(item.local).size;
      done += 1;
      continue;
    }
    pendingQueue.push(item);
  }

  const adaptiveOptions = normalizeAdaptiveControllerOptions(adaptive);
  const controller = adaptiveOptions && total >= 2
    ? createAdaptiveController({
        ...adaptiveOptions,
        min: Math.min(adaptiveOptions.min, total),
        max: Math.min(adaptiveOptions.max, total),
        initial: Math.min(adaptiveOptions.initial, total),
      })
    : null;

  let desired = controller ? controller.getConcurrency() : Math.min(SEGMENT_WORKERS, pendingQueue.length || total);
  let nextWorkerId = 0;
  let running = 0;
  let windowBytes = 0;
  let windowErrors = 0;
  let windowLatencyMs = 0;
  let windowRequests = 0;
  let windowStart = Date.now();
  const workers = new Set();

  const spawnAvailableWorkers = () => {
    const toSpawn = Math.max(0, desired - running);
    for (let i = 0; i < toSpawn && cursor < pendingQueue.length; i++) spawnWorker();
  };

  const flushAdaptiveWindow = () => {
    if (!controller) return;
    const elapsed = Date.now() - windowStart;
    if (elapsed <= 0) return;
    const decision = controller.sample({
      bytes: windowBytes, elapsedMs: elapsed, errors: windowErrors,
      concurrency: running, latencyMs: windowLatencyMs, requests: windowRequests,
      schedulerLimits: { downloadLimit: total, hostLimit: total, globalLimit: null },
    });
    windowBytes = 0; windowErrors = 0; windowLatencyMs = 0; windowRequests = 0;
    windowStart = Date.now();
    desired = controller.getConcurrency();
    onAdaptiveDecision?.(decision);
    onProgress?.({ done, total, totalBytes, failed, concurrency: desired, adaptiveDecision: decision });
    spawnAvailableWorkers();
  };

  const workerLoop = async (id) => {
    running++;
    try {
      while (!signal?.aborted && id < desired) {
        const current = pendingQueue[cursor++];
        if (!current) return;
        segmentStatuses.set(current.segmentId, 'downloading');
        let ok = false;
        for (let attempt = 1; attempt <= SEGMENT_ATTEMPTS && !ok; attempt++) {
          const startedAt = Date.now();
          try {
            const r = await fetchBinary(current.url, headers, signal);
            fs.writeFileSync(current.local, r.data);
            totalBytes += r.data.length;
            segMap.set(current.url, current.local);
            completedSegmentIds.add(current.segmentId);
            segmentStatuses.set(current.segmentId, 'completed');
            windowBytes += r.data.length;
            windowLatencyMs += Date.now() - startedAt;
            windowRequests++;
            ok = true;
          } catch {
            windowLatencyMs += Date.now() - startedAt;
            windowRequests++;
            windowErrors++;
            if (attempt >= SEGMENT_ATTEMPTS) {
              failed++;
              segmentStatuses.set(current.segmentId, 'pending');
            }
          }
        }
        done++;
        emitCheckpoint({
          taskState: done >= total && failed === 0 ? 'downloaded' : 'downloading',
          completedSegmentIds: [...completedSegmentIds],
          segmentStatuses,
          diagnostics: {
            segmentCount: parsedSegments.length,
            keyCount: parsedKeys.length,
            mapCount: parsedMaps.length,
            totalBytes, failed,
            resumedSegmentCount: completedSegmentIds.size,
          },
        });
        onProgress?.({ done, total, totalBytes, failed, concurrency: desired });
      }
    } finally {
      running--;
    }
  };

  function spawnWorker() {
    const id = nextWorkerId++;
    const p = workerLoop(id);
    const tracked = p.finally(() => workers.delete(tracked));
    workers.add(tracked);
  }

  const adaptiveTimer = controller
    ? setInterval(() => flushAdaptiveWindow(), Math.max(50, controller.config().windowMs || 1200))
    : null;
  adaptiveTimer?.unref?.();

  spawnAvailableWorkers();
  while (workers.size > 0) {
    await Promise.all([...workers]);
    spawnAvailableWorkers();
  }
  clearInterval(adaptiveTimer);
  flushAdaptiveWindow();

  const cancelled = Boolean(signal?.aborted);
  const adaptiveResult = controller
    ? { enabled: true, finalConcurrency: controller.getConcurrency() }
    : { enabled: false };

  return { totalBytes, failed, cancelled, adaptive: adaptiveResult };
}
