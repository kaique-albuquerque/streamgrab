/** Sonda o suporte a Range do servidor (`Range: bytes=0-0`). */

import { httpErrorFor, makeController, rethrowAbort, DEFAULT_TIMEOUT_MS } from './errors.js';

/**
 * Sonda o suporte a Range do servidor (`Range: bytes=0-0`).
 * P6.1: tambem captura os validators `ETag`/`Last-Modified` da resposta
 * (usados pelo resume para garantir que o recurso nao mudou).
 * @returns {Promise<{ok: true, acceptRanges: boolean, total: number, status: number,
 *   etag: string|null, lastModified: string|null}>}
 * @throws erro classificado (403/429/5xx viram Forbidden/RateLimit/Network).
 */
export async function detectAcceptRanges(url, { headers = {}, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const { controller, cleanup } = makeController(signal, timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { ...headers, Range: 'bytes=0-0' },
      redirect: 'follow',
      signal: controller.signal,
    });
    try {
      const etag = res.headers.get('etag');
      const lastModified = res.headers.get('last-modified');
      if (res.status === 206) {
        const contentRange = res.headers.get('content-range') || '';
        const m = /^bytes\s+\d+-\d+\/(\d+|\*)$/.exec(contentRange.trim());
        const total = m && m[1] !== '*' ? Number(m[1]) : 0;
        return { ok: true, acceptRanges: true, total, status: 206, etag, lastModified };
      }
      if (!res.ok) throw httpErrorFor(res, url);
      return { ok: true, acceptRanges: false, total: 0, status: res.status, etag, lastModified };
    } finally {
      await res.body?.cancel?.().catch(() => {});
    }
  } catch (err) {
    throw rethrowAbort(err, signal);
  } finally {
    cleanup();
  }
}
