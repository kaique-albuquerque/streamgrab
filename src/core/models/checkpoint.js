// ---------------------------------------------------------------------------
// Segment checkpoint model — DASH/HLS segment-level progress tracking (barrel).
//
// Implementação em ./checkpoint/:
//  - ids.js       → createSegmentTaskId
//  - normalize.js → normalização de entradas e estrutura default
//  - create.js    → createSegmentCheckpoint, getJobCheckpoint
//  - job.js       → setJobCheckpoint, setJobTaskState
// ---------------------------------------------------------------------------

export { createSegmentTaskId } from './checkpoint/ids.js';
export { createSegmentCheckpoint, getJobCheckpoint } from './checkpoint/create.js';
export { setJobCheckpoint, setJobTaskState } from './checkpoint/job.js';
