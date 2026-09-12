// ---------------------------------------------------------------------------
// Segment checkpoint model — DASH/HLS segment-level progress tracking.
// ---------------------------------------------------------------------------

import { nowIso, cloneSerializableObject } from './helpers.js';
import { isValidCheckpointTaskState } from './job-states.js';

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function normalizeSegmentCheckpointEntry(entry = {}) {
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

function createDefaultCheckpoint() {
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Gera um ID de segmento unico no formato:
 * stream:representationId:init|seg:index
 */
export function createSegmentTaskId({
  stream = 'video',
  representationId = '',
  segmentIndex = 0,
  init = false,
} = {}) {
  const normalizedStream = String(stream || 'video').trim().toLowerCase() || 'video';
  const normalizedRepresentation = String(representationId || '').trim() || 'default';
  const normalizedIndex = Number.isFinite(Number(segmentIndex)) ? Number(segmentIndex) : 0;
  const kind = init ? 'init' : 'seg';
  return `${normalizedStream}:${normalizedRepresentation}:${kind}:${normalizedIndex}`;
}

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

export function getJobCheckpoint(job) {
  if (!job?.meta?.checkpoint) return null;
  return createSegmentCheckpoint(job.meta.checkpoint);
}

export function setJobCheckpoint(job, checkpoint) {
  if (!job || typeof job !== 'object') {
    throw new TypeError('setJobCheckpoint: job deve ser um objeto');
  }
  const nextCheckpoint = createSegmentCheckpoint(checkpoint);
  job.meta = {
    ...(job.meta || {}),
    checkpoint: nextCheckpoint,
    taskState: nextCheckpoint.taskState,
    taskStateUpdatedAt: nextCheckpoint.updatedAt,
  };
  return nextCheckpoint;
}

export function setJobTaskState(job, taskState, { checkpoint = null } = {}) {
  if (!job || typeof job !== 'object') {
    throw new TypeError('setJobTaskState: job deve ser um objeto');
  }
  if (!isValidCheckpointTaskState(taskState)) {
    const err = new Error(`Estado de checkpoint invalido: "${taskState}"`);
    err.code = 'INVALID_CHECKPOINT_TASK_STATE';
    throw err;
  }
  const updatedAt = nowIso();
  job.meta = {
    ...(job.meta || {}),
    taskState,
    taskStateUpdatedAt: updatedAt,
  };
  if (checkpoint) {
    const nextCheckpoint = createSegmentCheckpoint({
      ...checkpoint,
      taskState,
    });
    nextCheckpoint.updatedAt = updatedAt;
    job.meta.checkpoint = nextCheckpoint;
  } else if (job.meta.checkpoint) {
    job.meta.checkpoint = {
      ...job.meta.checkpoint,
      taskState,
      updatedAt,
    };
  }
  return job;
}
