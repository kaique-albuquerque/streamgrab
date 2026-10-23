/**
 * Preview de mídia — gera um trecho curto (até 60s) para o usuário
 * conferir o conteúdo antes de baixar o arquivo completo.
 *
 * SPEC-06: docs/specs/06-preview-de-midia.md
 *
 * Estratégia:
 *  - mídia direta com suporte a Range: baixa apenas os primeiros bytes;
 *  - HLS/DASH: FFmpeg grava os primeiros N segundos com `-c copy`;
 *  - YouTube/redes sociais: yt-dlp baixa trecho com `--download-sections`;
 *  - yt-dlp também é fallback quando a URL não é direta.
 *
 * Este módulo não depende do Electron: recebe ffmpegPath, ytdlpPath e tempDir
 * por injeção, permitindo testes em Node puro.
 *
 * Implementação dividida em `src/preview/` (constantes, elegibilidade,
 * FFmpeg, yt-dlp, cache e orquestração).
 */

export {
  PREVIEW_DURATION_SECONDS,
  PREVIEW_MAX_BYTES,
  PREVIEW_TIMEOUT_MS,
  PREVIEW_YTDLP_TIMEOUT_MS,
  PREVIEW_CACHE_MS,
  PREVIEW_DIR_NAME,
  YTDLP_FORMAT_PREFIX,
  PREVIEWABLE_SOURCES,
  YTDLP_SOURCES,
} from './preview/constants.js';
export { isYtDlpFormatSelector, needsYtDlp, getPreviewDir, canPreview } from './preview/eligibility.js';
export { buildPreviewArgs, extractFfmpegError } from './preview/ffmpeg.js';
export { buildYtDlpPreviewArgs, extractYtDlpError } from './preview/ytdlp.js';
export { clearPreview, cleanOldPreviews } from './preview/cache.js';
export { generatePreview } from './preview/generate.js';
