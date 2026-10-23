/**
 * DownloadEngine — execution pipeline (analyze → prepare → download).
 *
 * Barrel: mantém a API pública original. A implementação vive em
 * `./lifecycle/*`, uma responsabilidade por arquivo.
 *
 * Standalone functions that receive the engine instance as the first
 * parameter, keeping the DownloadEngine class thin.
 */

export { analyze } from './lifecycle/analyze.js';
export { prepare } from './lifecycle/prepare.js';
export { resolveOutput } from './lifecycle/output.js';
export { downloadLoop } from './lifecycle/download-loop.js';
export { processSubtitles } from './lifecycle/subtitles.js';
export { processTranscription } from './lifecycle/transcription.js';
export { extensionFor } from './lifecycle/extension.js';
