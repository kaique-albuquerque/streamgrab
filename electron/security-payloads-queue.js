/**
 * P8 — Validação de payloads: queue / history / settings.
 */

import {
  isSafeHttpUrl,
  isSafeMediaSelection,
  isValidBrowserSpec,
  sanitizeDownloadFilename,
  isSafeAbsolutePath,
} from './security-primitives.js';

const JOB_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Valida o identificador de job da fila (job-<n>) ou entrada de historico. */
export function isValidJobId(value) {
  return typeof value === 'string' && JOB_ID_RE.test(value);
}

/** Payload de operacoes por id: { jobId }. */
export function validateJobIdPayload(payload = {}) {
  if (!isValidJobId(payload?.jobId)) return null;
  return { jobId: String(payload.jobId) };
}

/** Payload de operacoes de historico por id: { id }. */
export function validateHistoryIdPayload(payload = {}) {
  if (!isValidJobId(payload?.id)) return null;
  return { id: String(payload.id) };
}

/**
 * Valida o payload de `queue:enqueue` (botao "Adicionar a fila" / "Baixar").
 * Retorna o payload limpo ou null.
 */
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

const SETTINGS_KEYS = new Set([
  'defaultDir',
  'maxConcurrentDownloads',
  'turbo',
  'turboChunks',
  'smartTurbo',
  'defaultQuality',
  'audio',
  'notifications',
  'theme',
  'onComplete',
  'historyRetentionDays',
]);

/**
 * Valida o payload de `settings:update`: objeto plano com chaves conhecidas;
 * defaultDir, quando preenchido, deve ser caminho absoluto seguro.
 */
export function validateSettingsPayload(payload = {}) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const clean = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!SETTINGS_KEYS.has(key)) continue;
    if (key === 'defaultDir') {
      const dir = typeof value === 'string' ? value.trim() : '';
      if (dir && !isSafeAbsolutePath(dir)) return null;
      clean[key] = dir;
    } else if (key === 'maxConcurrentDownloads') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 32) return null;
      clean[key] = value;
    } else if (key === 'historyRetentionDays') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 3650) return null;
      clean[key] = value;
    } else if (key === 'turboChunks') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 64) return null;
      clean[key] = value;
    } else if (key === 'turbo' || key === 'audio' || key === 'notifications') {
      if (typeof value !== 'boolean' && typeof value !== 'string') return null;
      clean[key] = value;
    } else if (key === 'smartTurbo') {
      if (typeof value !== 'boolean' && !(value && typeof value === 'object' && !Array.isArray(value))) return null;
      clean[key] = value;
    } else {
      clean[key] = value;
    }
  }
  return clean;
}
