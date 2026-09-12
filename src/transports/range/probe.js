/**
 * Range transport — constants, helpers and probe.
 */

import { StreamGrabError } from '../../core/errors.js';
import { detectAcceptRanges } from '../http.js';

export const DEFAULT_RANGE_CHUNKS = 8;
export const DEFAULT_RANGE_BLOCK_MULTIPLIER = 8;

export function normalizeBlockCount(totalBytes, concurrency, blockCount) {
  const safeConcurrency = Math.max(1, Math.floor(concurrency || DEFAULT_RANGE_CHUNKS));
  const requested = Number(blockCount);
  if (Number.isInteger(requested) && requested >= safeConcurrency) return requested;

  const baseline = safeConcurrency * DEFAULT_RANGE_BLOCK_MULTIPLIER;
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) return baseline;

  const minBlockSize = 8 * 1024 * 1024;
  const maxBySize = Math.max(safeConcurrency, Math.ceil(totalBytes / minBlockSize));
  return Math.max(safeConcurrency, Math.min(baseline, maxBySize));
}

/** Divide o arquivo em ranges contiguos cobrindo [0, total). */
export function computeRanges(total, count) {
  const ranges = [];
  const chunkSize = Math.ceil(total / count);
  for (let i = 0; i < count; i++) {
    const start = i * chunkSize;
    if (start >= total) break;
    ranges.push({ start, end: Math.min(total - 1, start + chunkSize - 1) });
  }
  return ranges;
}

/**
 * Sonda o suporte a Range e retorna o tamanho total do arquivo.
 * @throws `RANGE_UNSUPPORTED` quando o servidor nao suporta Range/total.
 */
export async function probeRangeSupport(url, { headers = {}, signal, timeoutMs = 0 } = {}) {
  const probe = await detectAcceptRanges(url, { headers, signal, timeoutMs });
  if (!probe.acceptRanges) {
    throw new StreamGrabError('Servidor nao suporta download por partes (Range).', { code: 'RANGE_UNSUPPORTED' });
  }
  if (!probe.total) {
    throw new StreamGrabError('Servidor nao informou o tamanho total via Content-Range.', { code: 'RANGE_UNSUPPORTED' });
  }
  return { ok: true, total: probe.total, status: probe.status, etag: probe.etag, lastModified: probe.lastModified };
}
