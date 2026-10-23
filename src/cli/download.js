/**
 * Fluxos de download da CLI — barrel.
 *
 * A implementação vive em `./download/*`, uma responsabilidade por arquivo.
 * Este módulo mantém a API pública histórica de `src/cli/download.js`.
 */

export { cleanupPartial, analyzeFailure, printStderrTail } from './download/diagnostics.js';
export { runDownloadFlow } from './download/single-mode.js';
export { runMuxedDownloadFlow } from './download/muxed.js';
export { runMuxMultiDownloadFlow } from './download/mux-multi.js';
