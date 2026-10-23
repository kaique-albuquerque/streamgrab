/**
 * Validação do payload de `queue:enqueue` (botão "Adicionar à fila" / "Baixar").
 */

import {
  isSafeHttpUrl,
  isSafeMediaSelection,
  isValidBrowserSpec,
  sanitizeDownloadFilename,
  isSafeAbsolutePath,
} from '../security-primitives.js';

/** Retorna o payload limpo ou null. */
export function validateQueueEnqueuePayload(payload = {}) {
  const url = typeof payload?.url === 'string' ? payload.url.trim() : '';
  if (!isSafeHttpUrl(url)) return null;

  const filename = sanitizeDownloadFilename(payload?.filename);
  const outputDir = typeof payload?.outputDir === 'string' ? payload.outputDir.trim() : '';
  if (outputDir && !isSafeAbsolutePath(outputDir)) return null;

  const selectedUrl = typeof payload?.selectedUrl === 'string' ? payload.selectedUrl.trim() : '';
  if (selectedUrl && !isSafeMediaSelection(selectedUrl)) return null;

  const title = typeof payload?.title === 'string' ? payload.title.trim().slice(0, 200) : '';
  const turbo = payload?.turbo === true;
  const qualityChoice = typeof payload?.qualityChoice === 'string' ? payload.qualityChoice : '';
  if (qualityChoice && !/^\d+$/.test(qualityChoice)) return null;

  const cookiesFile = typeof payload?.cookiesFile === 'string' ? payload.cookiesFile.trim() : '';
  if (cookiesFile && !isSafeAbsolutePath(cookiesFile)) return null;
  const cookiesFromBrowser = typeof payload?.cookiesFromBrowser === 'string' ? payload.cookiesFromBrowser.trim() : '';
  if (cookiesFromBrowser && !isValidBrowserSpec(cookiesFromBrowser)) return null;

  const audioLanguage = typeof payload?.audioLanguage === 'string' ? payload.audioLanguage.trim().slice(0, 32) : '';
  const allAudio = payload?.allAudio === true;
  const subtitleLanguages = Array.isArray(payload?.subtitleLanguages)
    ? payload.subtitleLanguages
        .filter((s) => typeof s === 'string')
        .map((s) => s.trim().slice(0, 32))
        .filter(Boolean)
        .slice(0, 20)
    : [];
  const embedSubs = payload?.embedSubs === true;

  return {
    url,
    filename,
    outputDir,
    selectedUrl,
    title,
    turbo,
    qualityChoice,
    cookiesFile,
    cookiesFromBrowser,
    audioLanguage,
    allAudio,
    subtitleLanguages,
    embedSubs,
  };
}
