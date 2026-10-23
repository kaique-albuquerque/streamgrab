// ---------------------------------------------------------------------------
// Segment checkpoint — criação e leitura a partir do job.
// ---------------------------------------------------------------------------

import { nowIso, cloneSerializableObject } from '../helpers.js';
import { isValidCheckpointTaskState } from '../job-states.js';

import { createDefaultCheckpoint, normalizeSegmentCheckpointEntry } from './normalize.js';

/** Monta um checkpoint de segmentos normalizado e validado. */
export function createSegmentCheckpoint(input = {}) {
  const base = createDefaultCheckpoint();
  const taskState = String(input.taskState || base.taskState);
  const segments = Array.isArray(input.segments)
    ? input.segments.map((entry) => normalizeSegmentCheckpointEntry(entry))
    : base.segments;
  const completedSegmentIds = Array.isArray(input.completedSegmentIds)
    ? [...new Set(input.completedSegmentIds.map((value) => String(value || '')).filter(Boolean))]
    : base.completedSegmentIds;

  return {
    version: Number(input.version || base.version) || 1,
    backend: String(input.backend || base.backend),
    manifestUrl: String(input.manifestUrl || base.manifestUrl),
    outputMode: String(input.outputMode || base.outputMode),
    taskState: isValidCheckpointTaskState(taskState) ? taskState : base.taskState,
    selected: {
      videoRepresentationId: String(
        input.selected?.videoRepresentationId || input.selectedVideoRepresentationId || ''
      ),
      audioRepresentationId: String(
        input.selected?.audioRepresentationId || input.selectedAudioRepresentationId || ''
      ),
    },
    segments,
    completedSegmentIds,
    diagnostics: cloneSerializableObject(input.diagnostics),
    updatedAt: nowIso(),
  };
}

/** Lê o checkpoint do job (ou `null` quando não existe). */
export function getJobCheckpoint(job) {
  if (!job?.meta?.checkpoint) return null;
  return createSegmentCheckpoint(job.meta.checkpoint);
}
