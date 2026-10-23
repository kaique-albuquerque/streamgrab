// ---------------------------------------------------------------------------
// Segment checkpoint — normalização de entradas e estrutura default.
// ---------------------------------------------------------------------------

import { nowIso } from '../helpers.js';

import { createSegmentTaskId } from './ids.js';

/** Normaliza uma entrada de segmento para o shape persistido. */
export function normalizeSegmentCheckpointEntry(entry = {}) {
  const stream = String(entry.stream || entry.track || 'video');
  const index = Number(entry.index);
  return {
    id: String(
      entry.id ||
        createSegmentTaskId({
          stream,
          representationId: entry.representationId,
          segmentIndex: Number.isFinite(index) ? index : 0,
          init: Boolean(entry.init),
        })
    ),
    stream,
    representationId: String(entry.representationId || ''),
    index: Number.isFinite(index) ? index : 0,
    init: Boolean(entry.init),
    url: String(entry.url || ''),
    status: String(entry.status || 'pending'),
  };
}

/** Checkpoint vazio, base para `createSegmentCheckpoint`. */
export function createDefaultCheckpoint() {
  return {
    version: 1,
    backend: '',
    manifestUrl: '',
    outputMode: 'single',
    taskState: 'pending',
    selected: {
      videoRepresentationId: '',
      audioRepresentationId: '',
    },
    segments: [],
    completedSegmentIds: [],
    diagnostics: {},
    updatedAt: nowIso(),
  };
}
