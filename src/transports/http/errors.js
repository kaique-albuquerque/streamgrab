/** Erros e controle de aborto do transporte HTTP (`fetch` nativo). */

import { maskUrl } from '../../utils.js';
import {
  StreamGrabError,
  NetworkError,
  AuthenticationError,
  ForbiddenError,
  MediaNotFoundError,
  RateLimitError,
  CancelledError,
  classifyError,
} from '../../core/errors.js';

export const DEFAULT_TIMEOUT_MS = 0; // 0 = sem timeout

/** Monta o erro classificado para um status HTTP nao-ok. */
export function httpErrorFor(res, url) {
  const status = res.status;
  const detail = `HTTP ${status} para ${maskUrl(url)}`;
  if (status === 401) return new AuthenticationError(detail, { status });
  if (status === 403) return new ForbiddenError(detail, { status });
  if (status === 404) return new MediaNotFoundError(detail, { status });
  if (status === 429) {
    const err = new RateLimitError(`HTTP 429 para ${maskUrl(url)}`, { status });
    err.retryAfter = res.headers.get('retry-after');
    return err;
  }
  if (status >= 500) return new NetworkError(detail, { status, retryable: true });
  return new StreamGrabError(detail, { code: 'HTTP_ERROR', status, retryable: false });
}

/** Cria um AbortController vinculado ao signal do caller + timeout. */
export function makeController(signal, timeoutMs) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = timeoutMs && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  return {
    controller,
    cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

/** Reclassifica AbortError: timeout do controller vs cancelamento do caller. */
export function rethrowAbort(err, signal) {
  if (signal?.aborted) return new CancelledError('Operacao cancelada.');
  if (err?.name === 'AbortError') return new NetworkError('Timeout ao conectar.', { retryable: true });
  return classifyError(err);
}
