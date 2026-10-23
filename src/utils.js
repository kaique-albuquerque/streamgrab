/**
 * Utilitários compartilhados — barrel.
 *
 * A implementação vive em `./utils/*`, uma responsabilidade por arquivo.
 * Este módulo mantém a API pública histórica de `src/utils.js`.
 */

// Re-exports from focused modules (Sprint 2.3) — backward compatible.
export { DEFAULT_USER_AGENT, normalizeUrl, isValidM3u8Url, maskUrl } from './core/url-utils.js';
export { formatBytes, formatKbps } from './core/format-utils.js';
export { normalizeHeaders } from './core/header-utils.js';

export { detectSourceType, isSupportedMediaUrl, isYouTubeUrl } from './utils/source-type.js';
export { SOCIAL_HOSTS, isSocialMediaUrl, socialLabelForUrl } from './utils/social.js';
export { sanitizeFilename, ensureMp4 } from './utils/filename.js';
export { getDefaultDownloadsDir } from './utils/downloads-dir.js';
export { probeMediaContentType, isDirectMediaContentType } from './utils/media-probe.js';
export { getClipboardText } from './utils/clipboard.js';
