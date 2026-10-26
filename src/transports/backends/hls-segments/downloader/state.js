/**
 * Estado compartilhado do downloader concorrente de segmentos HLS.
 */

import fs from 'node:fs';

import {
  createAdaptiveController,
  normalizeAdaptiveControllerOptions,
} from '../../../adaptive-controller.js';

import { SEGMENT_WORKERS } from '../inspect.js';

/** Contadores da janela de amostragem do adaptive controller. */
function createWindow() {
  return {
    bytes: 0,
    errors: 0,
    latencyMs: 0,
    requests: 0,
    start: Date.now(),
  };
}

/** Zera os contadores da janela. */
export function resetWindow(slot) {
  slot.bytes = 0;
  slot.errors = 0;
  slot.latencyMs = 0;
  slot.requests = 0;
  slot.start = Date.now();
}

/**
 * Monta o estado mutable usado pelo loop de download, já contabilizando os
 * segmentos retomados a partir do checkpoint.
 */
export function createDownloaderState({
  queue, completedSegmentIds, segMap, segmentStatuses, adaptive,
}) {
  const total = queue.length;
  const pendingQueue = [];
  let totalBytes = 0;
  let done = 0;

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

  const desired = controller
    ? controller.getConcurrency()
    : Math.min(SEGMENT_WORKERS, pendingQueue.length || total);

  return {
    total,
    pendingQueue,
    completedSegmentIds,
    segMap,
    segmentStatuses,
    controller,
    totalBytes,
    done,
    failed: 0,
    cursor: 0,
    desired,
    nextWorkerId: 0,
    running: 0,
    window: createWindow(),
    workers: new Set(),
  };
}
