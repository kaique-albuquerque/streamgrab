// ---------------------------------------------------------------------------
// Segment checkpoint — mutações no job.
// ---------------------------------------------------------------------------

import { nowIso } from '../helpers.js';
import { isValidCheckpointTaskState } from '../job-states.js';

import { createSegmentCheckpoint } from './create.js';

/** Grava um checkpoint normalizado no `job.meta`. */
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

/** Atualiza o `taskState` do job e, opcionalmente, do checkpoint. */
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
