/**
 * Validação do payload de `settings:update`.
 */

import { isSafeAbsolutePath } from '../security-primitives.js';
import { isKnownModel } from '../../src/transcribe/model-manager.js';

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
  'clipboardWatch',
  'tutorialCompleted',
  'transcribeLang',
  'transcribeModel',
]);

function isIntInRange(value, min, max) {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

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
      if (!isIntInRange(value, 1, 32)) return null;
      clean[key] = value;
    } else if (key === 'historyRetentionDays') {
      if (!isIntInRange(value, 0, 3650)) return null;
      clean[key] = value;
    } else if (key === 'turboChunks') {
      if (!isIntInRange(value, 1, 64)) return null;
      clean[key] = value;
    } else if (key === 'turbo' || key === 'audio' || key === 'notifications') {
      if (typeof value !== 'boolean' && typeof value !== 'string') return null;
      clean[key] = value;
    } else if (key === 'tutorialCompleted') {
      if (typeof value !== 'boolean') return null;
      clean[key] = value;
    } else if (key === 'clipboardWatch') {
      if (typeof value !== 'boolean') return null;
      clean[key] = value;
    } else if (key === 'smartTurbo') {
      if (typeof value !== 'boolean' && !(value && typeof value === 'object' && !Array.isArray(value))) return null;
      clean[key] = value;
    } else if (key === 'transcribeModel') {
      const model = typeof value === 'string' ? value.trim().toLowerCase() : '';
      if (!isKnownModel(model)) return null;
      clean[key] = model;
    } else if (key === 'transcribeLang') {
      const lang = typeof value === 'string' ? value.trim().toLowerCase() : '';
      if (!/^(auto|[a-z]{2,3})$/.test(lang)) return null;
      clean[key] = lang;
    } else {
      clean[key] = value;
    }
  }
  return clean;
}
