/**
 * Validação de payloads: transcrição (transcribe:*).
 */

import { isSafeAbsolutePath } from './security-primitives.js';

/** Extensões de mídia aceitas para transcrição (vídeo e áudio). */
const MEDIA_EXTENSIONS = new Set([
  'mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v', 'flv', 'ts', 'mts', 'wmv', 'mpg', 'mpeg', '3gp',
  'mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wma',
]);

const TRANSCRIBE_FORMATS = new Set(['txt', 'md', 'srt']);
const LANGUAGE_RE = /^(auto|[a-z]{2,3})$/i;

/** Valida o payload de `transcribe:start`. Retorna o payload limpo ou null. */
export function validateTranscribePayload(payload = {}) {
  const videoPath = typeof payload?.videoPath === 'string' ? payload.videoPath.trim() : '';
  if (!isSafeAbsolutePath(videoPath)) return null;

  const ext = videoPath.split('.').pop()?.toLowerCase() || '';
  if (!MEDIA_EXTENSIONS.has(ext)) return null;

  const language = typeof payload?.language === 'string' ? payload.language.trim().toLowerCase() : 'pt';
  if (!LANGUAGE_RE.test(language)) return null;

  const formats = Array.isArray(payload?.formats)
    ? [...new Set(payload.formats.filter((f) => typeof f === 'string' && TRANSCRIBE_FORMATS.has(f)))]
    : ['txt', 'md'];
  if (formats.length === 0 || formats.length > 3) return null;

  const title = typeof payload?.title === 'string' ? payload.title.trim().slice(0, 200) : '';

  return { videoPath, language, formats, title };
}

/** Valida o payload de `transcribe:cancel` / operações por jobId. */
export function validateTranscribeJobPayload(payload = {}) {
  const jobId = typeof payload?.jobId === 'string' ? payload.jobId.trim() : '';
  if (!jobId || jobId.length > 100 || !/^[A-Za-z0-9_:-]+$/.test(jobId)) return null;
  return { jobId };
}
