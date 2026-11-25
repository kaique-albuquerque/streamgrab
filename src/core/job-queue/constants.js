/**
 * Estados de job (genéricos) e constantes do núcleo de fila.
 *
 * `queued/running/done/error/cancelled` descrevem o ciclo de vida de qualquer
 * job — o domínio (transcrição, tradução, download) fica no wrapper.
 */

export const JOB_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  DONE: 'done',
  ERROR: 'error',
  CANCELLED: 'cancelled',
};