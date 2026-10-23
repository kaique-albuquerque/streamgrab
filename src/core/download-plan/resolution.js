/** ProviderResolution: criação e validação. */

import { createMediaInfo } from '../models/index.js';
import { createRequestContext, isValidRequestContext } from '../request-context.js';
import { PROVIDER_RESOLUTION_CONFIDENCE, PROVIDER_RESOLUTION_MATCHERS } from './constants.js';
import { createProviderCapabilities, createStrategyHints } from './capabilities.js';
import { isPlainObject } from './validation.js';

export function createProviderResolution(input = {}) {
  if (!isPlainObject(input)) {
    throw new TypeError('createProviderResolution: entrada deve ser um objeto');
  }

  const matchedBy = String(input.matchedBy || '');
  const confidence = String(input.confidence || '');
  if (!input.providerId) {
    throw new TypeError('createProviderResolution: providerId e obrigatorio');
  }
  if (!PROVIDER_RESOLUTION_MATCHERS.includes(matchedBy)) {
    throw new TypeError(`createProviderResolution: matchedBy invalido "${matchedBy}"`);
  }
  if (!PROVIDER_RESOLUTION_CONFIDENCE.includes(confidence)) {
    throw new TypeError(`createProviderResolution: confidence invalido "${confidence}"`);
  }

  return {
    contractVersion: input.contractVersion === 2 ? 2 : undefined,
    providerId: String(input.providerId),
    kind: String(input.kind || ''),
    sourceUrl: String(input.sourceUrl || ''),
    matchedBy,
    confidence,
    pageUrl: String(input.pageUrl || ''),
    canonicalUrl: String(input.canonicalUrl || ''),
    manifestUrl: String(input.manifestUrl || ''),
    mediaUrl: String(input.mediaUrl || ''),
    formats: Array.isArray(input.formats) ? [...input.formats] : undefined,
    mediaInfo: input.mediaInfo == null ? null : createMediaInfo(input.mediaInfo),
    requestContext: createRequestContext(input.requestContext || {}),
    capabilities: createProviderCapabilities(input.capabilities || {}),
    strategyHints: createStrategyHints(input.strategyHints || {}),
    diagnostics: isPlainObject(input.diagnostics) ? { ...input.diagnostics } : {},
  };
}

export function isValidProviderResolution(value) {
  if (!isPlainObject(value)) return false;
  if (typeof value.providerId !== 'string' || !value.providerId) return false;
  if (!PROVIDER_RESOLUTION_MATCHERS.includes(value.matchedBy)) return false;
  if (!PROVIDER_RESOLUTION_CONFIDENCE.includes(value.confidence)) return false;
  if (!isValidRequestContext(value.requestContext)) return false;
  if (!isPlainObject(value.capabilities)) return false;
  if (!isPlainObject(value.strategyHints)) return false;
  if (!isPlainObject(value.diagnostics)) return false;
  return true;
}
