/**
 * Fluxo de download "turbo" (paralelo por partes) do CLI.
 * A implementacao vive em ./turbo/ (um modulo por responsabilidade).
 */

export { DEFAULT_TURBO_CHUNKS } from './turbo/constants.js';
export { cleanupResumeArtifacts } from './turbo/cleanup.js';
export { runTurboDownloadFlow } from './turbo/single.js';
export { runTurboMuxedDownloadFlow } from './turbo/muxed.js';
