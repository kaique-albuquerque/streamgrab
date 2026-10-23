/**
 * shared.js — utilitários compartilhados do renderer (barrel).
 *
 *  - ./shared/format.js   → formatadores (bytes, kbps, duração, data, erro)
 *  - ./shared/filename.js → nome/extensão do arquivo de saída
 *  - ./shared/progress.js → status, log, métricas, progresso e steps
 *  - ./shared/controls.js → lockTab e releaseOutput
 *  - ./shared/theme.js    → tema claro/escuro
 */

export {
  formatBytes,
  formatDate,
  formatDuration,
  formatKbps,
  formatUiError,
} from './shared/format.js';
export {
  detectExtensionFromUrl,
  ensureExpectedExtension,
  resolveDesiredFilename,
  resolvePreferredExtension,
  sanitizeFilename,
} from './shared/filename.js';
export {
  STEP_ORDER,
  appendLog,
  markAllPreviousAsDone,
  refreshResolvedOutput,
  resetProgress,
  setActiveStep,
  setStatus,
  syncMetrics,
} from './shared/progress.js';
export { lockTab, releaseOutput } from './shared/controls.js';
export { applyTheme, initializeTheme } from './shared/theme.js';
