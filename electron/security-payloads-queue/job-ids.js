/**
 * Validação de identificadores de job / histórico.
 */

const JOB_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Valida o identificador de job da fila (job-<n>) ou entrada de historico. */
export function isValidJobId(value) {
  return typeof value === 'string' && JOB_ID_RE.test(value);
}

/** Payload de operacoes por id: { jobId }. */
export function validateJobIdPayload(payload = {}) {
  if (!isValidJobId(payload?.jobId)) return null;
  return { jobId: String(payload.jobId) };
}

/** Payload de operacoes de historico por id: { id }. */
export function validateHistoryIdPayload(payload = {}) {
  if (!isValidJobId(payload?.id)) return null;
  return { id: String(payload.id) };
}
