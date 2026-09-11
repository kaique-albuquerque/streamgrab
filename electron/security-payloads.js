/**
 * P8 — Validação de payloads IPC (barrel re-export).
 *
 * Módulos internos:
 *  - security-payloads-download.js → analyze, download, cancel
 *  - security-payloads-queue.js     → jobId, history, queue enqueue, settings
 *  - security-payloads-app.js       → reveal, export logs, register root
 */

export { validateAnalyzePayload, validateDownloadPayload, validateCancelPayload } from './security-payloads-download.js';

export {
  isValidJobId,
  validateJobIdPayload,
  validateHistoryIdPayload,
  validateQueueEnqueuePayload,
  validateSettingsPayload,
} from './security-payloads-queue.js';

export { validateRevealPayload, validateExportLogsPayload, registerRevealRoot } from './security-payloads-app.js';
