/**
 * Modelos normalizados de ProviderResolution/DownloadPlan da Provider V2.
 *
 * Esta etapa nao muda o runtime legado; apenas oferece contratos e helpers
 * puros para a migracao incremental descrita na arquitetura.
 */

import { createMediaInfo } from './models.js';
import { createRequestContext, isValidRequestContext } from './request-context.js';

export const PROVIDER_RESOLUTION_CONFIDENCE = Object.freeze(['high', 'medium', 'low']);
export const PROVIDER_RESOLUTION_MATCHERS = Object.freeze([
  'url',
  'content-type',
  'html',
  'player',
  'manifest',
  'fallback',
]);
export const DOWNLOAD_PLAN_KINDS = Object.freeze(['direct', 'hls', 'dash', 'mux', 'ytdlp']);
export const PREFERRED_TRANSPORTS = Object.freeze(['http', 'range', 'curl', 'ffmpeg', 'segments', 'ytdlp']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOptionalObject(value, errorMessage) {
  if (value == null) return null;
  if (!isPlainObject(value)) throw new TypeError(errorMessage);
  return { ...value };
}

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

export function createDownloadPlan(input = {}) {
  if (!isPlainObject(input)) {
    throw new TypeError('createDownloadPlan: entrada deve ser um objeto');
  }

  const kind = String(input.kind || '');
  if (!DOWNLOAD_PLAN_KINDS.includes(kind)) {
    throw new TypeError(`createDownloadPlan: kind invalido "${kind}"`);
  }
  if (!isPlainObject(input.source)) {
    throw new TypeError('createDownloadPlan: source e obrigatorio e deve ser um objeto');
  }

  return {
    contractVersion: input.contractVersion === 2 ? 2 : undefined,
    kind,
    source: { ...input.source },
    requestContext: createRequestContext(input.requestContext || {}),
    selectedFormat: normalizeOptionalObject(
      input.selectedFormat,
      'createDownloadPlan: selectedFormat deve ser um objeto ou null',
    ),
    capabilities: createProviderCapabilities(input.capabilities || {}),
    strategyHints: createStrategyHints(input.strategyHints || {}),
    output: normalizeOptionalObject(input.output, 'createDownloadPlan: output deve ser um objeto ou null'),
    providerState: normalizeOptionalObject(
      input.providerState,
      'createDownloadPlan: providerState deve ser um objeto ou null',
    ),
    refreshState: normalizeOptionalObject(
      input.refreshState,
      'createDownloadPlan: refreshState deve ser um objeto ou null',
    ),
  };
}

export function isValidDownloadPlan(value) {
  if (!isPlainObject(value)) return false;
  if (!DOWNLOAD_PLAN_KINDS.includes(value.kind)) return false;
  if (!isPlainObject(value.source)) return false;
  if (!isValidRequestContext(value.requestContext)) return false;
  if (!isPlainObject(value.capabilities)) return false;
  if (!isPlainObject(value.strategyHints)) return false;
  if (!(value.selectedFormat === null || value.selectedFormat === undefined || isPlainObject(value.selectedFormat))) return false;
  if (!(value.output === null || value.output === undefined || isPlainObject(value.output))) return false;
  if (!(value.providerState === null || value.providerState === undefined || isPlainObject(value.providerState))) return false;
  if (!(value.refreshState === null || value.refreshState === undefined || isPlainObject(value.refreshState))) return false;
  return true;
}
