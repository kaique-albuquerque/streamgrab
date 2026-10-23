import { normalizeHeaders, DEFAULT_USER_AGENT } from '../utils.js';
import { parsePlaylistText } from './playlist.js';

/**
 * Busca o texto bruto de uma playlist HLS (sem parse).
 *
 * Retorna { text, url } — url é a URL final (após redirects), usada como base
 * para resolver URIs relativas e para inspeção de DRM antes do parse.
 */
export async function fetchPlaylistText(url, headers = {}, timeoutMs = 30000) {
  // P11.1: o fetch do Node nao envia User-Agent por padrao; varios CDNs/WAFs
  // rejeitam com 403 requisicoes sem UA (o CLI funciona porque o FFmpeg
  // sempre envia um). Header do usuario vence o default.
  const requestHeaders = normalizeHeaders({ 'User-Agent': DEFAULT_USER_AGENT, ...headers });
  const res = await fetch(url, {
    headers: requestHeaders,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`);
    err.status = res.status;
    throw err;
  }

  return { text: await res.text(), url: res.url || url };
}

/**
 * Baixa e interpreta uma playlist HLS.
 *
 * Retorna o mesmo formato de parsePlaylistText, com baseUrl = URL final
 * (após redirects) para resolução de URIs relativas.
 */
export async function fetchPlaylist(url, headers = {}, timeoutMs = 30000) {
  const { text, url: finalUrl } = await fetchPlaylistText(url, headers, timeoutMs);
  return parsePlaylistText(text, finalUrl);
}
