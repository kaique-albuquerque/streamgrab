// ---------------------------------------------------------------------------
// Job state constants, transition table, and validation helpers.
// Reference: architect.md secao 10
// ---------------------------------------------------------------------------

export const JOB_STATES = Object.freeze([
  'queued',
  'analyzing',
  'preparing',
  'downloading',
  'paused',
  'merging',
  'completed',
  'failed',
  'cancelled',
]);

export const TERMINAL_JOB_STATES = Object.freeze(['completed', 'failed', 'cancelled']);

export const CHECKPOINT_TASK_STATES = Object.freeze([
  'pending',
  'downloading',
  'downloaded',
  'processing',
  'completed',
]);

/** Valid transitions per state (architect.md secoes 10 e 24). */
export const JOB_TRANSITIONS = Object.freeze({
  queued: Object.freeze(['analyzing', 'cancelled']),
  analyzing: Object.freeze(['preparing', 'failed', 'cancelled']),
  preparing: Object.freeze(['downloading', 'failed', 'cancelled']),
  downloading: Object.freeze(['paused', 'merging', 'completed', 'failed', 'cancelled']),
  paused: Object.freeze(['downloading', 'cancelled']),
  merging: Object.freeze(['completed', 'failed']),
  completed: Object.freeze([]),
  failed: Object.freeze([]),
  cancelled: Object.freeze([]),
});

export function isValidJobState(state) {
  return typeof state === 'string' && JOB_STATES.includes(state);
}

export function isTerminalJobState(state) {
  return TERMINAL_JOB_STATES.includes(state);
}

export function isValidCheckpointTaskState(state) {
  return typeof state === 'string' && CHECKPOINT_TASK_STATES.includes(state);
}

export function canTransition(from, to) {
  return isValidJobState(from) && isValidJobState(to) && JOB_TRANSITIONS[from].includes(to);
}
