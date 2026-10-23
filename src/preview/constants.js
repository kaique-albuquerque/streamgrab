/**
 * Constantes do preview de mídia.
 *
 * SPEC-06: docs/specs/06-preview-de-midia.md
 */

export const PREVIEW_DURATION_SECONDS = 60;
export const PREVIEW_MAX_BYTES = 10 * 1024 * 1024; // 10 MB para mídia direta
export const PREVIEW_TIMEOUT_MS = 30000;
export const PREVIEW_YTDLP_TIMEOUT_MS = 90000; // 90s para yt-dlp (precisa baixar + merge)
export const PREVIEW_CACHE_MS = 30 * 60 * 1000; // 30 min
export const PREVIEW_DIR_NAME = 'streamgrab-preview';

/** Prefixo de seletores de formato yt-dlp (não são URLs reais). */
export const YTDLP_FORMAT_PREFIX = 'ytdlp-format:';

/** Fontes elegíveis para preview (DRM sempre excluído). */
export const PREVIEWABLE_SOURCES = Object.freeze(['hls', 'dash', 'direct', 'youtube', 'social', 'ytdlp']);

/** Fontes que precisam de yt-dlp para resolver o URL do vídeo. */
export const YTDLP_SOURCES = Object.freeze(['youtube', 'social', 'ytdlp']);
