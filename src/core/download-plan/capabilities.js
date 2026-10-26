/** Capabilities e strategyHints normalizados do provider. */

import { PREFERRED_TRANSPORTS } from './constants.js';
import { isPlainObject } from './validation.js';

export function createProviderCapabilities(input = {}) {
  if (!isPlainObject(input)) {
    throw new TypeError('createProviderCapabilities: entrada deve ser um objeto');
  }

  const out = {};
  const keys = [
    'qualitySelection',
    'refreshAccess',
    'rangeDownload',
    'segmentedDownload',
    'smartConcurrency',
    'browserProfileSupported',
  ];

  for (const key of keys) {
    if (Object.hasOwn(input, key)) out[key] = Boolean(input[key]);
  }
  return out;
}

export function createStrategyHints(input = {}) {
  if (!isPlainObject(input)) {
    throw new TypeError('createStrategyHints: entrada deve ser um objeto');
  }

  const out = {};
  if (Object.hasOwn(input, 'preferredTransport')) {
    const preferredTransport = String(input.preferredTransport || '');
    if (preferredTransport && !PREFERRED_TRANSPORTS.includes(preferredTransport)) {
      throw new TypeError(`createStrategyHints: preferredTransport invalido "${preferredTransport}"`);
    }
    if (preferredTransport) out.preferredTransport = preferredTransport;
  }
  if (Object.hasOwn(input, 'preferBrowserProfile')) {
    out.preferBrowserProfile = Boolean(input.preferBrowserProfile);
  }
  if (Object.hasOwn(input, 'preserveSelectedVariant')) {
    out.preserveSelectedVariant = Boolean(input.preserveSelectedVariant);
  }
  return out;
}
