/**
 * P4 — Transporte HTTP sequencial (plano §15/§16).
 *
 * Herda o papel do download direto que hoje vive em `cli/download.js`
 * (fluxo FFmpeg) e no `runStreamDownload` do engine: baixa uma URL direta
 * para arquivo via fetch nativo, com progresso, cancelamento e timeouts.
 *
 * Extras em relacao aos fluxos legados:
 *  - `detectAcceptRanges()`: sonda `Range: bytes=0-0` (206 -> suporta Range).
 *  - `downloadSequential({ validateMedia })`: detecta HTML/JSON no lugar de
 *    midia e lanca erro `NOT_MEDIA` (plano: "resposta HTML no lugar de midia").
 *  - Erros classificados na taxonomia (core/errors.js): 401/403/404/429/5xx,
 *    ENOSPC, EACCES etc. — permitindo strategy/retry por classe de erro.
 *
 * A implementacao vive em ./http/ (um modulo por responsabilidade).
 */

export { looksLikeHtml, looksLikeJson, isNotMediaResponse } from './http/media-detect.js';
export { detectAcceptRanges } from './http/detect.js';
export { downloadSequential } from './http/sequential.js';

import { downloadSequential } from './http/sequential.js';
import { detectAcceptRanges } from './http/detect.js';
import { isNotMediaResponse, looksLikeHtml, looksLikeJson } from './http/media-detect.js';

export default { downloadSequential, detectAcceptRanges, isNotMediaResponse, looksLikeHtml, looksLikeJson };
