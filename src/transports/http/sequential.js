/** Download sequencial via fetch nativo, com progresso e cancelamento. */

import fs from 'node:fs';
import { StreamGrabError } from '../../core/errors.js';
import { isNotMediaResponse } from './media-detect.js';
import { httpErrorFor, makeController, rethrowAbort, DEFAULT_TIMEOUT_MS } from './errors.js';

/**
 * Baixa `url` sequencialmente para `output` via fetch nativo.
 *
 * @param {object} params
 * @param {string} params.url
 * @param {string} params.output — caminho do arquivo de saida.
 * @param {object} [params.headers]
 * @param {AbortSignal} [params.signal]
 * @param {Function} [params.onProgress] — `({bytesDownloaded, totalBytes, percent, speed, etaSeconds})`.
 * @param {number} [params.timeoutMs] — 0 = sem timeout.
 * @param {boolean} [params.validateMedia] — detecta HTML/JSON no lugar de midia.
 * @returns {Promise<{ok: true, bytesDownloaded: number, totalBytes: number}>}
 * @throws erro classificado da taxonomia (Network/Forbidden/RateLimit/NOT_MEDIA...).
 */
export async function downloadSequential({
  url,
  output,
  headers = {},
  signal,
  onProgress,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  validateMedia = true,
} = {}) {
  const { controller, cleanup } = makeController(signal, timeoutMs);
  const started = Date.now();
  let downloaded = 0;

  const fh = await fs.promises.open(output, 'w');
  try {
    const res = await fetch(url, { method: 'GET', headers, redirect: 'follow', signal: controller.signal });
    if (!res.ok) throw httpErrorFor(res, url);

    const contentType = res.headers.get('content-type') || '';
    if (validateMedia && isNotMediaResponse(contentType)) {
      const err = new StreamGrabError(`Resposta nao e midia (${contentType || 'desconhecido'}).`, {
        code: 'NOT_MEDIA',
        status: res.status,
      });
      throw err;
    }

    const declaredTotal = Number(res.headers.get('content-length') || 0);
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.byteLength) {
        await fh.write(value, 0, value.byteLength);
        downloaded += value.byteLength;
        const elapsed = Date.now() - started;
        const speed = elapsed > 0 ? Math.round((downloaded / elapsed) * 1000) : 0;
        const etaSeconds = speed > 0 && declaredTotal > downloaded ? Math.round((declaredTotal - downloaded) / speed) : null;
        onProgress?.({
          bytesDownloaded: downloaded,
          totalBytes: declaredTotal || 0,
          percent: declaredTotal ? Math.min(100, Math.round((downloaded / declaredTotal) * 100)) : 0,
          speed,
          etaSeconds,
        });
      }
    }
    onProgress?.({ bytesDownloaded: downloaded, totalBytes: declaredTotal || downloaded, percent: 100, speed: 0, etaSeconds: 0 });
    return { ok: true, bytesDownloaded: downloaded, totalBytes: declaredTotal || downloaded };
  } catch (err) {
    throw rethrowAbort(err, signal);
  } finally {
    await fh.close().catch(() => {});
    cleanup();
  }
}
