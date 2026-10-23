/**
 * HLS segments — montagem da fila de segmentos e retomada por checkpoint.
 */

import fs from 'node:fs';

import { createSegmentTaskId } from '../../../../core/models/index.js';
import { segmentRepresentationId, localSegmentPath } from '../fetch.js';

/**
 * Monta a fila de segmentos e restaura o estado a partir do checkpoint.
 *
 * @returns {{ queue: Array, segMap: Map, completedSegmentIds: Set,
 *             segmentStatuses: Map, fallbackExt: string }}
 */
export function buildSegmentQueue({
  parsed, mediaBase, workDir, preferredVariantPath, checkpoint,
}) {
  const representationId = segmentRepresentationId(preferredVariantPath, mediaBase);
  const fallbackExt = parsed.maps.length > 0 ? 'mp4' : 'ts';

  const segMap = new Map();
  const completedSegmentIds = new Set();
  const segmentStatuses = new Map();
  const checkpointCompletedIds = new Set(
    Array.isArray(checkpoint?.completedSegmentIds)
      ? checkpoint.completedSegmentIds.map((v) => String(v || '')).filter(Boolean) : []
  );

  const queue = parsed.segments.map((segment, index) => ({
    index,
    url: new URL(segment.uri, mediaBase).toString(),
    uri: segment.uri,
    local: localSegmentPath(workDir, index, segment.uri, fallbackExt),
    segmentId: createSegmentTaskId({ stream: 'video', representationId, segmentIndex: index }),
  }));

  for (const item of queue) {
    if (checkpointCompletedIds.has(item.segmentId) && fs.existsSync(item.local)) {
      completedSegmentIds.add(item.segmentId);
      segmentStatuses.set(item.segmentId, 'completed');
      segMap.set(item.url, item.local);
    }
  }

  return { queue, segMap, completedSegmentIds, segmentStatuses, fallbackExt };
}
