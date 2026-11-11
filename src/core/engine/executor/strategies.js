/**
 * Executor — download strategy routing (barrel).
 *
 * Cada estratégia vive em um arquivo por responsabilidade; este barrel mantém
 * a superfície pública que o executor e os testes consomem.
 *
 * Contrato comum: cada função recebe o contexto do run() e devolve
 * { ok: true } | { ok: false, code, error, status, detail } |
 * { paused: true } | { cancelled: true } | null (seguir para a próxima estratégia).
 */

export { usesYtDlpDownload, usesYtDlpForSingle } from './yt-dlp-routing.js';
export { runMuxStrategy, runMuxMultiStrategy } from './strategies-mux.js';
export { runHlsDashStrategy } from './strategies-hls-dash.js';
export { runYtDlpSingleStrategy, runDirectStrategy } from './strategies-single.js';
