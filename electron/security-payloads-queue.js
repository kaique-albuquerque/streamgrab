/**
 * P8 — Validação de payloads: queue / history / settings (barrel).
 *
 * A implementação vive em `./security-payloads-queue/*`, uma responsabilidade
 * por arquivo. Este módulo mantém a API pública histórica.
 */

export { isValidJobId, validateJobIdPayload, validateHistoryIdPayload } from './security-payloads-queue/job-ids.js';
export { validateHistoryExportPayload } from './security-payloads-queue/history-export.js';
export { validateBatchEnqueuePayload } from './security-payloads-queue/batch-enqueue.js';
export { validateQueueEnqueuePayload } from './security-payloads-queue/queue-enqueue.js';
export { validateSettingsPayload } from './security-payloads-queue/settings.js';
