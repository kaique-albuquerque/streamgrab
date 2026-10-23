/**
 * Classificação de erros crus na taxonomia.
 */

import { SYS_RETRYABLE_CODES, StreamGrabError } from './base.js';
import {
  AuthenticationError,
  ForbiddenError,
  MediaNotFoundError,
  RateLimitError,
  NetworkError,
  UnsupportedSourceError,
  YtDlpError,
  FFmpegError,
  CancelledError,
  DiskSpaceError,
  PermissionError,
} from './classes.js';

/**
 * Classifica um erro cru na classe correspondente da taxonomia.
 * - Erros ja classificados (StreamGrabError) passam direto.
 * - Status HTTP: 401 -> Authentication, 403 -> Forbidden, 404 -> NotFound,
 *   429 -> RateLimit, >=500 -> Network (retryable).
 * - err.code do Node: ECONNRESET/ETIMEDOUT/... -> Network (retryable),
 *   ENOSPC -> DiskSpace, EACCES/EPERM -> Permission.
 * - Codigos dos adapters: UNSUPPORTED_SOURCE, YTDLP_ANALYZE_FAILED (com
 *   needsAuth vira Authentication), YTDLP_FORMAT_UNAVAILABLE, FFMPEG_ERROR,
 *   CANCELLED.
 * - Caso contrario: StreamGrabError generico (nao retryable).
 */
export function classifyError(err, options = {}) {
  if (err instanceof StreamGrabError) return err;
  const status = Number(err?.status || options?.status || 0);
  const code = String(err?.code || '');
  const message = String(err?.message || String(err) || 'Erro desconhecido.');
  const detail = String(err?.stderr || err?.detail || '');
  const cause = err;

  const wrap = (Cls, extra = {}) => new Cls(message, { detail, cause, ...extra });

  if (status === 401) return wrap(AuthenticationError, { status });
  if (status === 403) return wrap(ForbiddenError, { status });
  if (status === 404) return wrap(MediaNotFoundError, { status });
  if (status === 429) return wrap(RateLimitError, { status });
  if (status >= 500) return wrap(NetworkError, { status, retryable: true });
  if (code === 'UNSUPPORTED_SOURCE') return wrap(UnsupportedSourceError);
  if (code === 'YTDLP_ANALYZE_FAILED') {
    return err?.needsAuth ? wrap(AuthenticationError) : wrap(YtDlpError);
  }
  if (code === 'YTDLP_FORMAT_UNAVAILABLE') return wrap(YtDlpError);
  if (code === 'FFMPEG_ERROR' || code === 'FFMPEG_FAILED') return wrap(FFmpegError);
  if (code === 'CANCELLED' || code === 'ABORT_ERR') return wrap(CancelledError);
  if (SYS_RETRYABLE_CODES.has(code)) return wrap(NetworkError, { retryable: true, status });
  if (code === 'ENOSPC') return wrap(DiskSpaceError);
  if (code === 'EACCES' || code === 'EPERM') return wrap(PermissionError);
  return new StreamGrabError(message, {
    code: code || 'STREAMGRAB_ERROR',
    detail,
    retryable: false,
    cause,
    status,
  });
}
