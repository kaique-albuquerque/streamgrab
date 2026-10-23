/**
 * P2.2 — Taxonomia de erros (barrel).
 *
 * Secao 26 do architect.md: cada erro tem classe propria, mensagem amigavel
 * (para a UI), detalhe tecnico (para diagnostico) e retryability.
 *
 * P11 (secao 42 — UX de falhas): cada classe tambem carrega um
 * `suggestedAction` (acao sugerida ao usuario) e `friendlyReport()` gera um
 * relatorio plano { message, suggestedAction, detail, code, retryable } para
 * o CLI e o Electron renderizarem "Motivo / Acao sugerida / [Detalhes]" sem
 * acoplar a UI a instancias de erro.
 *
 * classifyError() converte erros crus (status HTTP, err.code do Node, codigos
 * dos adapters) na classe correspondente, para que a UI/P2.5 nunca precise
 * decidir retry por heuristica local (secao 40 do architect.md).
 *
 * A implementação vive em `./errors/*`, uma responsabilidade por arquivo.
 */

export { StreamGrabError } from './errors/base.js';
export {
  UnsupportedSourceError,
  NetworkError,
  AuthenticationError,
  ForbiddenError,
  RateLimitError,
  ExpiredUrlError,
  MediaNotFoundError,
  FFmpegError,
  YtDlpError,
  DiskSpaceError,
  PermissionError,
  UnsupportedDrmError,
  CancelledError,
  isStreamGrabError,
  isRetryable,
} from './errors/classes.js';
export { classifyError } from './errors/classify.js';
export { friendlyReport } from './errors/report.js';
