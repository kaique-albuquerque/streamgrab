/**
 * Validação do payload de `batch:enqueue` (download em lote).
 */

import { isSafeHttpUrl, isSafeAbsolutePath, sanitizeDownloadFilename } from '../security-primitives.js';

/**
 * Retorna o payload limpo ou null se as URLs forem inválidas ou o diretório inseguro.
 */
export function validateBatchEnqueuePayload(payload = {}) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const rawUrls = Array.isArray(payload.urls) ? payload.urls : [];
  const rawNames = Array.isArray(payload.names) ? payload.names : [];
  const urls = [];
  const names = [];
  for (const [index, u] of rawUrls.entries()) {
    const value = typeof u === 'string' ? u.trim() : '';
    if (value && isSafeHttpUrl(value) && urls.length < 1000) {
      const rawName = rawNames[index];
      names.push(typeof rawName === 'string' ? sanitizeDownloadFilename(rawName).slice(0, 120) : '');
      urls.push(value);
    }
  }
  if (urls.length === 0) return null;

  const outputDir = typeof payload.outputDir === 'string' ? payload.outputDir.trim() : '';
  if (outputDir && !isSafeAbsolutePath(outputDir)) return null;

  const turbo = payload.turbo === true;
  const rawAudio = typeof payload.audioExtract === 'string' ? payload.audioExtract.trim().toLowerCase() : '';
  const audioExtract = ['off', 'm4a', 'mp3'].includes(rawAudio) ? rawAudio : '';
  const allAudio = payload.allAudio === true;
  const subtitleLanguages = Array.isArray(payload.subtitleLanguages)
    ? payload.subtitleLanguages
        .filter((s) => typeof s === 'string')
        .map((s) => s.trim().slice(0, 32))
        .filter(Boolean)
        .slice(0, 20)
    : [];
  const embedSubs = payload.embedSubs === true;

  return {
    urls,
    names,
    outputDir,
    turbo,
    audioExtract,
    allAudio,
    subtitleLanguages,
    embedSubs,
  };
}
