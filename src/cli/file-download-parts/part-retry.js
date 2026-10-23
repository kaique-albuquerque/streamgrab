/**
 * Classificação de erros e retentativa de uma parte.
 */

import fs from 'node:fs';
import { CancelledError, NetworkError, RateLimitError } from '../../core/errors.js';
import { delay, PART_RETRY_BASE_DELAY_MS, PART_RETRY_LIMIT } from '../file-download-shared.js';
import { downloadToPartFile } from './part-request.js';

/** Falhas de rede/limite de taxa merecem nova tentativa; cancelamento não. */
export function isRetryablePartError(err) {
  if (!err) return false;
  if (err instanceof CancelledError) return false;
  if (err instanceof RateLimitError) return true;
  if (err instanceof NetworkError) return true;
  if (err?.name === 'AbortError') return true;
  if (typeof err?.message === 'string' && /fetch failed|timeout|socket|network|reset|econn|undici|terminated/i.test(err.message)) {
    return true;
  }
  return err?.retryable === true;
}

export async function downloadPartWithRetry({ retryLimit = PART_RETRY_LIMIT, io, ...params }) {
  let lastError = null;
  for (let attempt = 1; attempt <= retryLimit; attempt++) {
    try {
      await fs.promises.unlink(params.partPath).catch(() => {});
      await downloadToPartFile(params);
      return { ok: true, attempts: attempt };
    } catch (err) {
      lastError = err;
      if (params.signal?.aborted || err instanceof CancelledError) throw err;
      if (!isRetryablePartError(err) || attempt >= retryLimit) throw err;
      const waitMs = PART_RETRY_BASE_DELAY_MS * attempt;
      io?.log?.(
        `[turbo] Parte ${params.range.index + 1} falhou (${err.message}). Tentando novamente ${attempt}/${retryLimit - 1} em ${waitMs}ms...`,
      );
      await delay(waitMs);
    }
  }
  throw lastError;
}
