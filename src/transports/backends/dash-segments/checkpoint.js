/**
 * DASH segments — checkpoint builder.
 */

import fs from 'node:fs';
import path from 'node:path';

import { createSegmentCheckpoint, createSegmentTaskId } from '../../../core/models/index.js';
import { resolveAbsolute } from './helpers.js';

export function buildCheckpointIds(videoRep, audioRep) {
  const videoCheckpointId = createSegmentTaskId({
    stream: 'video',
    representationId: videoRep.id || 'video',
    segmentIndex: 0,
    init: true,
  });
  const audioCheckpointId = audioRep
    ? createSegmentTaskId({
        stream: 'audio',
        representationId: audioRep.id || 'audio',
        segmentIndex: 0,
        init: true,
      })
    : null;
  return { videoCheckpointId, audioCheckpointId };
}

/**
 * Creates a factory function that builds and emits checkpoints.
 * Returns { emitCheckpoint, completedSegmentIds, representationStatuses }.
 */
export function createCheckpointEmitter({
  manifestUrl, videoRep, audioRep, manifestBase,
  videoCheckpointId, audioCheckpointId, onCheckpoint,
}) {
  const completedSegmentIds = new Set();
  const representationStatuses = new Map();

  function emitCheckpoint({ taskState = 'downloading', diagnostics = {} } = {}) {
    const segments = [
      {
        id: videoCheckpointId,
        stream: 'video',
        representationId: videoRep.id || 'video',
        index: 0,
        init: true,
        url: resolveAbsolute(videoRep.baseUrl, manifestBase),
        status: representationStatuses.get(videoCheckpointId) || 'pending',
      },
    ];
    if (audioRep) {
      segments.push({
        id: audioCheckpointId,
        stream: 'audio',
        representationId: audioRep.id || 'audio',
        index: 0,
        init: true,
        url: resolveAbsolute(audioRep.baseUrl, manifestBase),
        status: representationStatuses.get(audioCheckpointId) || 'pending',
      });
    }
    const ckpt = createSegmentCheckpoint({
      backend: 'dash-segments',
      manifestUrl,
      outputMode: audioRep ? 'mux' : 'single',
      taskState,
      selected: {
        videoRepresentationId: videoRep.id || '',
        audioRepresentationId: audioRep?.id || '',
      },
      segments,
      completedSegmentIds: [...completedSegmentIds],
      diagnostics,
    });
    onCheckpoint?.(ckpt);
    return ckpt;
  }

  return { emitCheckpoint, completedSegmentIds, representationStatuses };
}

/**
 * Restores completed segments from a previous checkpoint.
 * Returns { restored, pendingQueue } where `restored` has results for
 * already-downloaded items and `pendingQueue` has items still to download.
 */
export function restoreFromCheckpoint(queue, checkpointCompletedIds, manifestBase, workDir) {
  const restored = new Map();
  const pendingQueue = [];
  let totalBytes = 0;
  let done = 0;

  for (const item of queue) {
    const absolute = resolveAbsolute(item.rep.baseUrl, manifestBase);
    const ext = path.extname(new URL(absolute).pathname) || '.mp4';
    const localPath = path.join(workDir, `${item.kind}${ext}`);
    item.localPath = localPath;

    if (checkpointCompletedIds.has(item.checkpointId) && fs.existsSync(localPath)) {
      const bytes = fs.statSync(localPath).size;
      restored.set(item.kind, { localPath, bytes, absoluteUrl: absolute });
      totalBytes += bytes;
      done += 1;
      continue;
    }
    pendingQueue.push(item);
  }

  return { restored, pendingQueue, totalBytes, done };
}
