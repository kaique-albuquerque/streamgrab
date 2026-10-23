/**
 * Loop principal do download concorrente de segmentos HLS.
 */

import { createDownloaderState } from './state.js';
import { createAdaptiveWindow } from './adaptive.js';
import { createWorkers } from './worker.js';

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
  parsedSegments, parsedKeys, parsedMaps,
  headers, signal, onProgress, onAdaptiveDecision, emitCheckpoint,
  adaptive,
}) {
  const state = createDownloaderState({
    queue, completedSegmentIds, segMap, segmentStatuses, adaptive,
  });

  const { spawnAvailableWorkers, waitAll } = createWorkers({
    state,
    headers,
    signal,
    onProgress,
    emitCheckpoint,
    diagnostics: {
      segmentCount: parsedSegments.length,
      keyCount: parsedKeys.length,
      mapCount: parsedMaps.length,
    },
  });

  const { flush, start } = createAdaptiveWindow({
    state, spawnAvailableWorkers, onProgress, onAdaptiveDecision,
  });

  const adaptiveTimer = start();
  adaptiveTimer?.unref?.();

  spawnAvailableWorkers();
  await waitAll();
  clearInterval(adaptiveTimer);
  flush();

  const cancelled = Boolean(signal?.aborted);
  const adaptiveResult = state.controller
    ? { enabled: true, finalConcurrency: state.controller.getConcurrency() }
    : { enabled: false };

  return {
    totalBytes: state.totalBytes,
    failed: state.failed,
    cancelled,
    adaptive: adaptiveResult,
  };
}
