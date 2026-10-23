/**
 * Requisição HTTP Range de uma parte, com validação de Content-Range.
 */

import fs from 'node:fs';
import { CancelledError, ForbiddenError, NetworkError, RateLimitError, StreamGrabError } from '../../core/errors.js';

export async function downloadToPartFile({ url, headers, range, partPath, onBytes, signal }) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { ...headers, Range: `bytes=${range.start}-${range.end}` },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (signal?.aborted) throw new CancelledError('Operacao cancelada.');
    if (res.status === 403) throw new ForbiddenError('HTTP 403 ao baixar parte.', { status: 403 });
    if (res.status === 429) throw new RateLimitError('HTTP 429 ao baixar parte.', { status: 429 });
    if (res.status >= 500) throw new NetworkError(`HTTP ${res.status} ao baixar parte.`, { status: res.status, retryable: true });
    if (res.status !== 206 || !res.body) {
      throw new StreamGrabError('Servidor nao respondeu 206 para a parte solicitada.', { code: 'RANGE_UNSUPPORTED' });
    }

    const contentRange = res.headers.get('content-range') || '';
    const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/.exec(contentRange.trim());
    if (!match || Number(match[1]) !== range.start || Number(match[2]) !== range.end) {
      throw new StreamGrabError(`Content-Range invalido para a parte (${contentRange || 'ausente'}).`, {
        code: 'INVALID_CONTENT_RANGE',
      });
    }

    const out = await fs.promises.open(partPath, 'w');
    try {
      const reader = res.body.getReader();
      let position = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (signal?.aborted) throw new CancelledError('Operacao cancelada.');
        if (done) break;
        if (value?.byteLength) {
          await out.write(value, 0, value.byteLength, position);
          position += value.byteLength;
          onBytes(value.byteLength);
        }
      }
      const expected = range.end - range.start + 1;
      if (position !== expected) {
        throw new StreamGrabError(`Parte incompleta (esperado ${expected}, recebeu ${position}).`, {
          code: 'INCOMPLETE_RANGE',
        });
      }
    } finally {
      await out.close().catch(() => {});
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
