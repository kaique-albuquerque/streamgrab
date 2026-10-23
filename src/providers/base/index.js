/**
 * Helpers do contrato de provider para a migracao incremental.
 */

import {
  createDownloadPlan,
  createProviderResolution,
  createStrategyHints,
} from '../../core/download-plan.js';
import { createRequestContext } from '../../core/request-context.js';
import { isPlainObject, isProviderV2 } from './contract.js';
import {
  inferCapabilities,
  inferMatchedBy,
  inferPlanKind,
  inferPreferredTransport,
  inferResolutionKind,
  inferSource,
  normalizeSelectedFormat,
} from './infer.js';

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
