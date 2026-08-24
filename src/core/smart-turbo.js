/**
 * P6.2 — Smart Turbo compatibility facade.
 *
 * The adaptive policy now lives in `src/transports/adaptive-controller.js`.
 * This file preserves the public Smart Turbo API used by the current Range
 * transport and tests while the architecture migrates to a shared controller.
 */

import {
  ADAPTIVE_CONTROLLER_DEFAULTS,
  createAdaptiveController,
  normalizeAdaptiveControllerOptions,
} from '../transports/adaptive-controller.js';

export const SMART_TURBO_DEFAULTS = ADAPTIVE_CONTROLLER_DEFAULTS;

export function createSmartTurbo(options = {}) {
  return createAdaptiveController(options);
}

/** Normaliza o parametro `smartTurbo` (boolean | objeto) para opcoes. */
export function normalizeSmartTurbo(smartTurbo) {
  return normalizeAdaptiveControllerOptions(smartTurbo);
}

/** Erros de chunk que o Smart Turbo trata como sinal (429/5xx retryable). */
export function isRetryableChunkError(err) {
  if (!err) return false;
  if (err?.code === 'RATE_LIMIT_ERROR') return true;
  if (err?.retryable === true && (err?.code === 'NETWORK_ERROR' || err?.status >= 500)) return true;
  return false;
}

export default { createSmartTurbo, normalizeSmartTurbo, isRetryableChunkError, SMART_TURBO_DEFAULTS };
