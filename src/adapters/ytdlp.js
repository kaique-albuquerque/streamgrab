/**
 * Motor generico baseado no yt-dlp — barrel de compatibilidade.
 *
 * Modulos internos (src/adapters/ytdlp/):
 *  - constants.js       → limites, prefixos e classificacao de erros
 *  - format-mapper.js   → traducao dos formatos brutos do yt-dlp
 *  - subtitles.js       → extracao de legendas
 *  - analysis.js        → montagem da analise (MediaInfo)
 *  - circuit-breaker.js → bloqueio apos erros repetidos de plataforma
 *  - analyze.js         → analyzeYtDlpUrl
 *  - download-plan.js   → prepareYtDlpDownload
 *
 * O yt-dlp mantem as logicas de decifracao/anti-bot atualizadas pela
 * comunidade; aqui apenas consumimos o dump JSON (URLs ja decifradas) e
 * reaproveitamos o fluxo existente de download/mux do projeto.
 */

export {
  YTDLP_ANALYZE_MAX_ATTEMPTS,
  YTDLP_FORMAT_UNAVAILABLE,
  ADAPTIVE_URI_PREFIX,
  isLoginRequiredError,
  isSpawnBlockedError,
} from './ytdlp/constants.js';

export { CircuitBreaker } from './ytdlp/circuit-breaker.js';
export { analyzeYtDlpUrl } from './ytdlp/analyze.js';
export { prepareYtDlpDownload } from './ytdlp/download-plan.js';
