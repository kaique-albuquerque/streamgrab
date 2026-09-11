/**
 * P8 — Validação de payloads: analyze / download / cancel.
 */

import {
  isSafeHttpUrl,
  isSafeMediaSelection,
  isValidTaskId,
  isValidBrowserSpec,
  sanitizeDownloadFilename,
  isSafeAbsolutePath,
  sanitizeHeaders,
} from './security-primitives.js';

/** Valida o payload de `playlist:analyze`. Retorna o payload limpo ou null. */
export function validateAnalyzePayload(payload = {}) {
  const url = typeof payload?.url === 'string' ? payload.url.trim() : '';
  if (!isSafeHttpUrl(url)) return null;
  const rawHeaders = payload?.headers && typeof payload.headers === 'object' && !Array.isArray(payload.headers)
    ? payload.headers
    : {};
  const headers = sanitizeHeaders(rawHeaders);
  const rawAuth = payload?.auth && typeof payload.auth === 'object' && !Array.isArray(payload.auth) ? payload.auth : {};
  const cookiesFile = typeof rawAuth.cookiesFile === 'string' ? rawAuth.cookiesFile.trim() : '';
  if (cookiesFile && !isSafeAbsolutePath(cookiesFile)) return null;
  const cookiesFromBrowser = typeof rawAuth.cookiesFromBrowser === 'string' ? rawAuth.cookiesFromBrowser.trim() : '';
  if (cookiesFromBrowser && !isValidBrowserSpec(cookiesFromBrowser)) return null;
  const auth = { cookiesFile, cookiesFromBrowser };
  return { url, headers, auth };
}

/** Valida o payload de `download:start`. Retorna o payload limpo ou null. */
export function validateDownloadPayload(payload = {}) {
  if (!isValidTaskId(payload?.taskId)) return null;
  const url = typeof payload?.url === 'string' ? payload.url.trim() : '';
  if (!isSafeHttpUrl(url)) return null;

  const filename = sanitizeDownloadFilename(payload?.filename);
  if (!filename) return null;

  const outputDir = typeof payload?.outputDir === 'string' ? payload.outputDir.trim() : '';
  if (outputDir && !isSafeAbsolutePath(outputDir)) return null;

  const qualityChoice = typeof payload?.qualityChoice === 'string' ? payload.qualityChoice : '';
  if (qualityChoice && !/^\d+$/.test(qualityChoice)) return null;

  const selectedUrl = typeof payload?.selectedUrl === 'string' ? payload.selectedUrl.trim() : '';
  if (selectedUrl && !isSafeMediaSelection(selectedUrl)) return null;
  const title = typeof payload?.title === 'string' ? payload.title.trim().slice(0, 200) : '';

  const overwriteAction = ['overwrite', 'rename', 'cancel'].includes(payload?.overwriteAction)
    ? payload.overwriteAction
    : 'overwrite';
  const overwriteNewName = sanitizeDownloadFilename(payload?.overwriteNewName) || '';
  const forceCurl = payload?.forceCurl === true;
  const turbo = payload?.turbo === true;

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
    taskId: String(payload.taskId),
    url,
    filename,
    outputDir,
    qualityChoice,
    selectedUrl,
    title,
    overwriteAction,
    overwriteNewName,
    forceCurl,
    turbo,
    cookiesFile,
    cookiesFromBrowser,
    audioLanguage,
    allAudio,
    subtitleLanguages,
    embedSubs,
  };
}

/** Valida o payload de `download:cancel`. */
export function validateCancelPayload(payload = {}) {
  if (!isValidTaskId(payload?.taskId)) return null;
  return { taskId: String(payload.taskId) };
}
