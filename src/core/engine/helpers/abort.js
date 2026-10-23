export function isAbortReasonPause(reason) {
  return reason === 'pause';
}

export function abortOutcome(signal, ok = false) {
  if (!signal?.aborted) return ok ? { ok: true } : null;
  return isAbortReasonPause(signal.reason) ? { paused: true } : { cancelled: true };
}
