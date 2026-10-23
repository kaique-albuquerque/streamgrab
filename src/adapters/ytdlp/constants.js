/**
 * Constantes e classificadores de erro do motor yt-dlp.
 */

/** Tentativas máximas da análise quando o spawn do yt-dlp está bloqueado. */
export const YTDLP_ANALYZE_MAX_ATTEMPTS = 3;

export const YTDLP_FORMAT_UNAVAILABLE = 'YTDLP_FORMAT_UNAVAILABLE';

/** Prefixo das URIs de variantes adaptativas escolhidas no CLI/Electron. */
export const ADAPTIVE_URI_PREFIX = 'ytdlp-format:';

/**
 * Padroes de erro do yt-dlp que indicam conteudo autenticado/restrito.
 * Usados para oferecer a dica de cookies quando a analise falha.
 */
const LOGIN_REQUIRED_HINTS = [
  'sign in',
  'signin',
  'log in',
  'login',
  'private',
  'requires authentication',
  'authentication required',
  'you must be logged in',
  'members only',
  'this video is only available',
  'requested format is not available',
  '403 forbidden',
  'forbidden',
];

/** Detecta se o stderr do yt-dlp indica conteúdo autenticado/restrito. */
export function isLoginRequiredError(stderr) {
  const text = String(stderr || '').toLowerCase();
  return LOGIN_REQUIRED_HINTS.some((hint) => text.includes(hint));
}

/** Padroes de stderr que indicam spawn bloqueado (Windows Defender na 1a execucao). */
const SPAWN_BLOCKED_HINTS = [
  'eperm',
  'ebusy',
  'eacces',
  'eagain',
  'emfile',
  'enoent',
  'access is denied',
  '0xc0000135', // STATUS_DLL_NOT_FOUND
  '0xc0000022', // STATUS_ACCESS_DENIED
];

/** true se o stderr indica spawn bloqueado/transitorio (nao erro do yt-dlp). */
export function isSpawnBlockedError(stderr) {
  const s = String(stderr || '').toLowerCase();
  return SPAWN_BLOCKED_HINTS.some((hint) => s.includes(hint));
}
