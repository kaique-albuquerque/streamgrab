/**
 * P2.2 / P11 — Classes de erro da taxonomia.
 *
 * Cada classe carrega `suggestedAction` (acao sugerida ao usuario), usada por
 * `friendlyReport()` para que o CLI e o Electron renderizem
 * "Motivo / Acao sugerida / [Detalhes]" sem acoplar a UI a instancias de erro.
 */

import { StreamGrabError, defineErrorClass } from './base.js';

export const UnsupportedSourceError = defineErrorClass('UnsupportedSourceError', {
  code: 'UNSUPPORTED_SOURCE',
  retryable: false,
  defaultMessage: 'Fonte nao suportada.',
  suggestedAction: 'Verifique se a URL e de uma fonte suportada (HLS .m3u8, DASH .mpd, YouTube, midia direta) ou tente outra URL.',
});
export const NetworkError = defineErrorClass('NetworkError', {
  code: 'NETWORK_ERROR',
  retryable: true,
  defaultMessage: 'Falha de rede ao acessar o servidor.',
  suggestedAction: 'Verifique sua conexao com a internet e tente novamente.',
});
export const AuthenticationError = defineErrorClass('AuthenticationError', {
  code: 'AUTHENTICATION_ERROR',
  retryable: false,
  defaultMessage: 'Conteudo exige autenticacao (login).',
  suggestedAction: 'O conteudo parece exigir login. Forneca cookies com --cookies <arquivo> ou --cookies-from-browser <navegador>.',
});
export const ForbiddenError = defineErrorClass('ForbiddenError', {
  code: 'FORBIDDEN_ERROR',
  retryable: false,
  defaultMessage: 'Acesso negado (403).',
  suggestedAction: 'A URL foi recusada pelo servidor. Ela pode ter expirado ou exigir headers de navegador (--curl-impersonate) ou cookies.',
});
export const RateLimitError = defineErrorClass('RateLimitError', {
  code: 'RATE_LIMIT_ERROR',
  retryable: true,
  defaultMessage: 'Limite de requisicoes atingido (429).',
  suggestedAction: 'O servidor esta limitando requisicoes. Aguarde alguns instantes e tente novamente.',
});
export const ExpiredUrlError = defineErrorClass('ExpiredUrlError', {
  code: 'EXPIRED_URL_ERROR',
  retryable: false,
  defaultMessage: 'A URL expirou.',
  suggestedAction: 'Analise novamente a URL para obter um novo endereco valido.',
});
export const MediaNotFoundError = defineErrorClass('MediaNotFoundError', {
  code: 'MEDIA_NOT_FOUND_ERROR',
  retryable: false,
  defaultMessage: 'Midia nao encontrada (404).',
  suggestedAction: 'Verifique se a URL esta correta ou se o video foi removido da plataforma.',
});
export const FFmpegError = defineErrorClass('FFmpegError', {
  code: 'FFMPEG_ERROR',
  retryable: false,
  defaultMessage: 'Falha ao processar com FFmpeg.',
  suggestedAction: 'Verifique se o FFmpeg esta instalado (npm run ffmpeg:install no Windows) e se o formato da midia e suportado.',
});
export const YtDlpError = defineErrorClass('YtDlpError', {
  code: 'YTDLP_ERROR',
  retryable: false,
  defaultMessage: 'Falha ao analisar com yt-dlp.',
  suggestedAction: 'Atualize o yt-dlp (npm run update:ytdlp) ou verifique se a plataforma ainda e suportada.',
});
export const DiskSpaceError = defineErrorClass('DiskSpaceError', {
  code: 'DISK_SPACE_ERROR',
  retryable: false,
  defaultMessage: 'Espaco em disco insuficiente.',
  suggestedAction: 'Libere espaco em disco na pasta de destino e tente novamente.',
});
export const PermissionError = defineErrorClass('PermissionError', {
  code: 'PERMISSION_ERROR',
  retryable: false,
  defaultMessage: 'Sem permissao de escrita.',
  suggestedAction: 'Escolha outra pasta de destino ou verifique as permissoes de escrita do diretorio.',
});
export const UnsupportedDrmError = defineErrorClass('UnsupportedDrmError', {
  code: 'UNSUPPORTED_DRM_ERROR',
  retryable: false,
  defaultMessage: 'Conteudo protegido por DRM nao e suportado.',
  suggestedAction: 'Este conteudo e protegido por DRM (Widevine/PlayReady/FairPlay) e nao pode ser baixado pelo StreamGrab.',
});
export const CancelledError = defineErrorClass('CancelledError', {
  code: 'CANCELLED',
  retryable: false,
  defaultMessage: 'Operacao cancelada pelo usuario.',
  suggestedAction: 'Nenhuma acao necessaria — o download foi cancelado.',
});

export function isStreamGrabError(err) {
  return err instanceof StreamGrabError;
}

export function isRetryable(err) {
  return err instanceof StreamGrabError ? err.retryable : false;
}
