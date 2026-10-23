/**
 * Detecção de content-type de mídia (HEAD/GET-range).
 */

import { DEFAULT_USER_AGENT } from '../core/url-utils.js';
import { normalizeHeaders } from '../core/header-utils.js';

/**
 * Probe rapido de content-type SEM baixar o corpo do arquivo.
 * 1) tenta HEAD; 2) se o servidor nao aceitar (405/403/erro), faz GET com
 * Range: bytes=0-0 e aborta assim que os headers chegam (o corpo nunca e lido).
 * Seguranca extra: timeout de 8s. Retorna '' se nao conseguir detectar.
 */
export async function probeMediaContentType(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const hdrs = { 'User-Agent': DEFAULT_USER_AGENT, ...normalizeHeaders(headers) };
    let res = null;
    try {
      res = await fetch(url, { method: 'HEAD', headers: hdrs, redirect: 'follow', signal: controller.signal });
      if (res.ok) {
        const ct = (res.headers.get('content-type') || '').trim();
        if (ct) return ct;
      }
    } catch {
      /* HEAD indisponivel → tenta GET com Range */
    }
    res = await fetch(url, {
      method: 'GET',
      headers: { ...hdrs, Range: 'bytes=0-0' },
      redirect: 'follow',
      signal: controller.signal,
    });
    return (res.headers.get('content-type') || '').trim();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
    try {
      controller.abort();
    } catch {
      /* ja abortado */
    }
  }
}

/**
 * Content-types tratados como midia direta (video/*, audio/* e alguns conhecidos).
 * Nao inclui application/x-mpegurl / vnd.apple.mpegurl (esses sao HLS, que so
 * deve ser detectado pela extensao .m3u8).
 */
export function isDirectMediaContentType(contentType) {
  if (!contentType) return false;
  const base = contentType.toLowerCase().trim().split(';')[0].trim();
  if (base.startsWith('video/')) return true;
  if (base.startsWith('audio/')) return true;
  return base === 'application/mp4' || base === 'application/octet-stream';
}
