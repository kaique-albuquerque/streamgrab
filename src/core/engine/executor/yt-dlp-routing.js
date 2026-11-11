/**
 * Roteamento de yt-dlp — quais fontes/formatos devem baixar pelo yt-dlp.
 *
 * `adapter.id` chega ao executor como 'youtube'/'social' (fachada legada) ou
 * 'ytdlp' (provider novo); a URL do YouTube cobre o caso sem `sourceType`.
 */

import { isYouTubeUrl } from '../../../utils.js';

/**
 * Fontes cujo download deve passar pelo yt-dlp: YouTube e redes sociais.
 */
export function usesYtDlpDownload(sourceType, url) {
  const st = String(sourceType || '').toLowerCase();
  return st === 'ytdlp' || st === 'youtube' || st === 'social' || isYouTubeUrl(url || '');
}

/**
 * Redes sociais com formato progressivo tambem vao pelo yt-dlp: as URLs de CDN
 * do Facebook/Instagram/TikTok sao assinadas e expiram (HTTP direto devolve
 * 403). O YouTube progressivo fica de fora de proposito — as URLs do
 * googlevideo ja vao decifradas e o HTTP direto funciona.
 */
export function usesYtDlpForSingle(sourceType) {
  return String(sourceType || '').toLowerCase() === 'social';
}