/**
 * Helpers do contrato de provider para a migracao incremental.
 *
 * Fase 1: apenas valida/identifica contratos. A adaptacao legacy -> V2 fica
 * para a fase seguinte.
 */

import {
  createDownloadPlan,
  createProviderCapabilities,
  createProviderResolution,
  createStrategyHints,
} from '../core/download-plan.js';
import { createRequestContext } from '../core/request-context.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isProviderV2(provider) {
  return Boolean(provider && typeof provider.resolve === 'function');
}

export function isLegacyProvider(provider) {
  return Boolean(provider && typeof provider.analyze === 'function' && !isProviderV2(provider));
}

export function getProviderContractVersion(provider) {
  return isProviderV2(provider) ? 2 : 1;
}

export function defineProvider(provider) {
  if (!isPlainObject(provider)) {
    throw new TypeError('defineProvider: provider deve ser um objeto');
  }
  if (!provider.id || typeof provider.id !== 'string') {
    throw new TypeError('defineProvider: provider.id e obrigatorio');
  }
  if (!provider.label || typeof provider.label !== 'string') {
    throw new TypeError('defineProvider: provider.label e obrigatorio');
  }
  if (!Number.isFinite(provider.priority)) {
    throw new TypeError('defineProvider: provider.priority deve ser numerico');
  }
  if (typeof provider.detect !== 'function') {
    throw new TypeError('defineProvider: provider.detect deve ser funcao');
  }
  if (Object.hasOwn(provider, 'prepareDownload') && typeof provider.prepareDownload !== 'function') {
    throw new TypeError('defineProvider: provider.prepareDownload deve ser funcao quando informado');
  }
  if (Object.hasOwn(provider, 'analyze') && typeof provider.analyze !== 'function') {
    throw new TypeError('defineProvider: provider.analyze deve ser funcao quando informado');
  }
  if (Object.hasOwn(provider, 'resolve') && typeof provider.resolve !== 'function') {
    throw new TypeError('defineProvider: provider.resolve deve ser funcao quando informado');
  }
  return provider;
}

function inferResolutionKind(provider, analysis, url) {
  return String(
    analysis?.sourceType ||
    analysis?.kind ||
    provider?.id ||
    (typeof url === 'string' && url.includes('.m3u8') ? 'hls' : ''),
  );
}

function inferMatchedBy(provider, url) {
  if (provider?.id === 'direct' && typeof url === 'string' && !/\.\w+(?:$|[?#])/.test(url)) {
    return 'content-type';
  }
  return 'url';
}

function inferPlanKind(provider, prepared, analysis) {
  if (prepared?.strategy === 'mux') return 'mux';
  const providerId = String(provider?.id || '');
  if (providerId === 'ytdlp') return 'ytdlp';
  const kind = String(analysis?.sourceType || analysis?.kind || providerId || 'direct');
  if (['direct', 'hls', 'dash', 'mux', 'ytdlp'].includes(kind)) return kind;
  return 'direct';
}

function inferSource(provider, prepared, params) {
  if (prepared?.strategy === 'mux') {
    return {
      videoUrl: String(prepared.videoUrl || ''),
      audioUrl: String(prepared.audioUrl || ''),
      formatId: String(prepared.formatId || ''),
    };
  }

  const downloadUrl = String(prepared?.downloadUrl || params.selectedUrl || params.url || '');
  if (provider?.id === 'hls') return { manifestUrl: downloadUrl };
  if (provider?.id === 'dash') return { manifestUrl: downloadUrl };
  if (provider?.id === 'ytdlp') return { url: downloadUrl, formatId: String(prepared?.formatId || '') };
  return { url: downloadUrl };
}

function inferPreferredTransport(provider, prepared, analysis, options = {}) {
  if (prepared?.strategy === 'mux') return 'ytdlp';
  if (provider?.id === 'hls' || analysis?.sourceType === 'hls') return 'ffmpeg';
  if (provider?.id === 'dash' || analysis?.sourceType === 'dash') return 'ffmpeg';
  if (provider?.id === 'direct' && options.turbo) return 'range';
  return undefined;
}

function inferCapabilities(provider) {
  return createProviderCapabilities({
    qualitySelection: Boolean(provider?.supportsQualitySelection),
    rangeDownload: provider?.id === 'direct',
  });
}

export async function resolveProvider(provider, input = {}, context = {}) {
  if (isProviderV2(provider)) {
    return provider.resolve(input, context);
  }
  if (!provider || typeof provider.analyze !== 'function') {
    throw new TypeError('resolveProvider: provider nao suporta resolve() nem analyze()');
  }

  const analysis = await provider.analyze(input, context);
  const requestContext = createRequestContext({
    headers: input.headers || context.headers,
  });
  const formats = typeof provider.getFormats === 'function' ? provider.getFormats(analysis) : [];

  return createProviderResolution({
    contractVersion: 2,
    providerId: provider.id,
    kind: inferResolutionKind(provider, analysis, input.url),
    sourceUrl: String(input.url || ''),
    matchedBy: inferMatchedBy(provider, input.url),
    confidence: 'high',
    pageUrl: String(input.url || ''),
    canonicalUrl: String(input.url || ''),
    manifestUrl: provider.id === 'hls' || provider.id === 'dash' ? String(input.url || '') : '',
    mediaUrl: provider.id === 'direct' ? String(input.url || '') : '',
    formats,
    mediaInfo: analysis,
    requestContext,
    capabilities: inferCapabilities(provider),
    strategyHints: createStrategyHints({ preferredTransport: inferPreferredTransport(provider, null, analysis) }),
    diagnostics: {},
  });
}

export async function prepareProviderDownload(provider, params = {}, context = {}) {
  if (!provider || typeof provider.prepareDownload !== 'function') {
    throw new TypeError('prepareProviderDownload: provider.prepareDownload() e obrigatorio');
  }

  const prepared = await provider.prepareDownload(params, context);
  if (isPlainObject(prepared) && isPlainObject(prepared.requestContext) && isPlainObject(prepared.source) && prepared.kind) {
    return prepared;
  }

  const requestContext = createRequestContext({
    headers: params.headers || context.headers,
  });

  return createDownloadPlan({
    contractVersion: 2,
    kind: inferPlanKind(provider, prepared, params.analysis),
    source: inferSource(provider, prepared, params),
    requestContext,
    selectedFormat: normalizeSelectedFormat(params),
    capabilities: inferCapabilities(provider),
    strategyHints: createStrategyHints({
      preferredTransport: inferPreferredTransport(provider, prepared, params.analysis, params.options),
    }),
    providerState: null,
    refreshState: null,
  });
}

function normalizeSelectedFormat(params = {}) {
  if (!params.selectedUrl && !params.formatId) return null;
  return {
    url: String(params.selectedUrl || ''),
    formatId: String(params.formatId || ''),
  };
}
