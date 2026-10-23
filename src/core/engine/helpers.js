/**
 * Helpers puros do engine — funcoes sem I/O, sem dependencias de estado.
 * Separados para facilitar testes unitarios e reduzir o tamanho do engine.js.
 * A implementacao vive em ./helpers/ (um modulo por responsabilidade).
 */

export const FALLBACK_TITLE = 'video';

export { isAbortReasonPause, abortOutcome } from './helpers/abort.js';
export {
  resolveFreshVariant,
  maskDiagUrl,
  safePathname,
  isMdstrmPlayerUrl,
} from './helpers/urls.js';
export {
  progressUpdate,
  estimateEtaFromPercent,
  segmentProgressToEngine,
} from './helpers/progress.js';
export { makeFfmpegProgress } from './helpers/ffmpeg-progress.js';
export {
  normalizePreparedDownload,
  headersFromRequestContext,
  isRefreshableFailure,
} from './helpers/prepared.js';
