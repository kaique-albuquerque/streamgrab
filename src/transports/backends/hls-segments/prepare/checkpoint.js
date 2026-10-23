/**
 * HLS segments — emissão de checkpoints de segmento.
 */

import { createSegmentCheckpoint, createSegmentTaskId } from '../../../../core/models/index.js';
import { segmentRepresentationId } from '../fetch.js';

/**
 * Cria a função que monta e entrega os checkpoints ao consumidor.
 *
 * @returns {(payload?: object) => object}
 */
export function createCheckpointEmitter({ parsed, mediaBase, preferredVariantPath, onCheckpoint }) {
  const representationId = segmentRepresentationId(preferredVariantPath, mediaBase);

  return ({
    taskState = 'downloading',
    completedSegmentIds = [],
    segmentStatuses = new Map(),
    diagnostics = {},
  } = {}) => {
    const cp = createSegmentCheckpoint({
      backend: 'hls-segments', manifestUrl: mediaBase, outputMode: 'single', taskState,
      segments: parsed.segments.map((segment, index) => {
        const segmentId = createSegmentTaskId({
          stream: 'video', representationId, segmentIndex: index,
        });
        return {
          id: segmentId,
          stream: 'video',
          representationId,
          index,
          url: new URL(segment.uri, mediaBase).toString(),
          status: segmentStatuses.get(segmentId) || 'pending',
        };
      }),
      completedSegmentIds, diagnostics,
    });
    onCheckpoint?.(cp);
    return cp;
  };
}
