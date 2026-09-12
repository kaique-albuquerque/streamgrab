/**
 * src/core/models/index.js — barrel re-export.
 *
 * Mantem a API publica do antigo models.js para que imports como
 * `import { createMediaInfo } from './models.js'` continuem funcionando
 * (apontando para este diretorio via index.js).
 */

// State constants and helpers
export {
  JOB_STATES,
  TERMINAL_JOB_STATES,
  CHECKPOINT_TASK_STATES,
  JOB_TRANSITIONS,
  isValidJobState,
  isTerminalJobState,
  isValidCheckpointTaskState,
  canTransition,
} from './job-states.js';

// Format
export { createFormat, isValidFormat } from './format.js';

// AudioTrack + SubtitleTrack (P12)
export { createAudioTrack, createSubtitleTrack } from './tracks.js';

// MediaInfo
export { createMediaInfo, isValidMediaInfo } from './media-info.js';

// Segment checkpoints
export {
  createSegmentTaskId,
  createSegmentCheckpoint,
  getJobCheckpoint,
  setJobCheckpoint,
  setJobTaskState,
} from './checkpoint.js';

// DownloadJob lifecycle
export {
  createDownloadJob,
  transitionJob,
  serializeJob,
  toJson,
  formatFromVariant,
} from './download-job.js';
