/**
 * Regras puras de elegibilidade e localização dos previews.
 */

import path from 'node:path';
import { PREVIEWABLE_SOURCES, PREVIEW_DIR_NAME, YTDLP_FORMAT_PREFIX, YTDLP_SOURCES } from './constants.js';

/** Verifica se um quality é um seletor yt-dlp (não é URL direta). */
export function isYtDlpFormatSelector(quality) {
  return typeof quality === 'string' && quality.startsWith(YTDLP_FORMAT_PREFIX);
}

/** Verifica se a fonte precisa de yt-dlp para preview. */
export function needsYtDlp(sourceType, quality) {
  if (YTDLP_SOURCES.includes(String(sourceType || '').toLowerCase())) return true;
  return isYtDlpFormatSelector(quality);
}

/** Diretório de previews dentro do temp do sistema/app. */
export function getPreviewDir(tempDir) {
  return path.join(tempDir, PREVIEW_DIR_NAME);
}

/** Verifica se uma fonte pode gerar preview. */
export function canPreview(sourceType) {
  return PREVIEWABLE_SOURCES.includes(String(sourceType || '').toLowerCase());
}
