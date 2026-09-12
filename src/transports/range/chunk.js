/**
 * Range transport — single chunk fetcher (fetches one Range part).
 */

import { StreamGrabError, ForbiddenError, RateLimitError, NetworkError, CancelledError } from '../../core/errors.js';
import { isNotMediaResponse } from '../http.js';

/**
 * Fetches a single Range chunk and writes it to the file handle.
 *
 * @param {object} opts
 * @param {{start: number, end: number}} opts.chunk
 * @param {string} opts.url
 * @param {object} opts.fh - open FileHandle
 * @param {object} opts.headers
 * @param {AbortSignal} opts.signal
 * @param {number} opts.timeoutMs
 * @param {boolean} opts.validateMedia
 * @param {number} opts.total
 * @param {object} opts.tracker - { downloaded, started, onProgress }
 * @param {object} opts.resumeCtx - { resume, state, persistState } or null
 * @returns {Promise<void>}
 */
export async function fetchChunk({
  chunk, url, fh, headers, signal, timeoutMs, validateMedia, total, tracker, resumeCtx,
}) {
  const { start, end } = chunk;
  const controller = new AbortController();
  let readerRef = null;
  let abortReason = null;

  const onAbort = () => {
    abortReason = 'signal';
    controller.abort();
    readerRef?.cancel().catch(() => {});
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  const timer = timeoutMs && timeoutMs > 0
    ? setTimeout(() => { abortReason = 'timeout'; controller.abort(); readerRef?.cancel().catch(() => {}); }, timeoutMs)
    : null;

  try {
    if (signal?.aborted) throw new CancelledError('Operacao cancelada.');
    const res = await fetch(url, {
      method: 'GET',
      headers: { ...headers, Range: `bytes=${start}-${end}` },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (signal?.aborted) throw new CancelledError('Operacao cancelada.');
    if (res.status === 403) throw new ForbiddenError('HTTP 403 ao baixar parte.', { status: 403 });
    if (res.status === 429) {
      const err = new RateLimitError('HTTP 429 ao baixar parte.', { status: 429 });
      err.retryAfter = res.headers.get('retry-after');
      throw err;
    }
    if (res.status >= 500) throw new NetworkError(`HTTP ${res.status} ao baixar parte.`, { status: res.status, retryable: true });
    if (res.status !== 206 || !res.body) {
      throw new StreamGrabError('Servidor nao respondeu 206 para a parte solicitada.', { code: 'RANGE_UNSUPPORTED' });
    }

    const contentRange = res.headers.get('content-range') || '';
    const m = /^bytes\s+(\d+)-\d+\/(\d+|\*)$/.exec(contentRange.trim());
    if (!m || Number(m[1]) !== start) {
      throw new StreamGrabError(`Content-Range invalido para a parte (${contentRange || 'ausente'}).`, {
        code: 'INVALID_CONTENT_RANGE',
      });
    }

    const contentType = res.headers.get('content-type') || '';
    if (validateMedia && isNotMediaResponse(contentType)) {
      throw new StreamGrabError(`Resposta nao e midia (${contentType || 'desconhecido'}).`, {
        code: 'NOT_MEDIA', status: res.status,
      });
    }

    const reader = res.body.getReader();
    readerRef = reader;
    let pos = start;
    for (;;) {
      const { done, value } = await reader.read();
      if (signal?.aborted) throw new CancelledError('Operacao cancelada.');
      if (done) break;
      if (value?.byteLength) {
        await fh.write(value, 0, value.byteLength, pos);
        pos += value.byteLength;
        tracker.downloaded += value.byteLength;
        const elapsed = Date.now() - tracker.started;
        const speed = elapsed > 0 ? Math.round((tracker.downloaded / elapsed) * 1000) : 0;
        const etaSeconds = speed > 0 && tracker.downloaded < total
          ? Math.round((total - tracker.downloaded) / speed) : null;
        tracker.onProgress?.({
          bytesDownloaded: tracker.downloaded,
          totalBytes: total,
          percent: Math.min(100, Math.round((tracker.downloaded / total) * 100)),
          speed, etaSeconds,
        });
      }
    }
    if (pos !== end + 1) {
      throw new StreamGrabError(`Parte incompleta (esperado ate ${end}, recebido ate ${pos - 1}).`, {
        code: 'INCOMPLETE_RANGE',
      });
    }

    if (resumeCtx?.resume && resumeCtx?.state) {
      const stored = resumeCtx.state.chunks.find((c) => c.start === start && c.end === end);
      if (stored) { stored.completed = true; stored.downloaded = end - start + 1; }
      await resumeCtx.persistState();
    }
  } catch (err) {
    if (resumeCtx?.resume && resumeCtx?.state) await resumeCtx.persistState();
    if (abortReason === 'signal' || signal?.aborted) throw new CancelledError('Operacao cancelada.');
    if (abortReason === 'timeout' || err?.name === 'AbortError') {
      throw new NetworkError('Timeout ao baixar parte.', { retryable: true });
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
