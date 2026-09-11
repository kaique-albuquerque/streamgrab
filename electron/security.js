/**
 * P8 — Segurança do Electron (seção 24 do architect.md)
 *
 * Barrel re-export — mantém compatibilidade com todos os imports existentes.
 *
 * Módulos internos:
 *  - security-primitives.js → validações atômicas (URLs, paths, headers, etc.)
 *  - security-payloads.js   → validação de payloads IPC inteiros
 */

export {
  sanitizeHeaders,
  isSafeHttpUrl,
  isSafeMediaSelection,
  isValidTaskId,
  isValidBrowserSpec,
  sanitizeDownloadFilename,
  isAbsolutePath,
  isSafeAbsolutePath,
  isPathWithin,
} from './security-primitives.js';

export {
  validateAnalyzePayload,
  validateDownloadPayload,
  validateCancelPayload,
  isValidJobId,
  validateJobIdPayload,
  validateHistoryIdPayload,
  validateQueueEnqueuePayload,
  validateSettingsPayload,
  validateRevealPayload,
  validateExportLogsPayload,
  registerRevealRoot,
} from './security-payloads.js';
