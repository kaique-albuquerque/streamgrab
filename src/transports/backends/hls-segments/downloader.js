/**
 * HLS segments — concurrent segment download worker with adaptive control
 * (barrel).
 *
 * Implementação em ./downloader/:
 *  - state.js    → estado compartilhado e contadores da janela
 *  - worker.js   → workers concorrentes, retry e checkpoint
 *  - adaptive.js → amostragem/ajuste de concorrência
 *  - index.js    → runSegmentDownloader
 */

export { runSegmentDownloader } from './downloader/index.js';
