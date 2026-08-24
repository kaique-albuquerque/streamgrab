import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DOWNLOAD_PLAN_KINDS,
  PREFERRED_TRANSPORTS,
  PROVIDER_RESOLUTION_CONFIDENCE,
  PROVIDER_RESOLUTION_MATCHERS,
  createProviderCapabilities,
  createStrategyHints,
  createProviderResolution,
  isValidProviderResolution,
  createDownloadPlan,
  isValidDownloadPlan,
} from '../../src/core/download-plan.js';

test('download-plan: enums publicos permanecem congelados', () => {
  assert.deepEqual(PROVIDER_RESOLUTION_CONFIDENCE, ['high', 'medium', 'low']);
  assert.deepEqual(PROVIDER_RESOLUTION_MATCHERS, ['url', 'content-type', 'html', 'player', 'manifest', 'fallback']);
  assert.deepEqual(DOWNLOAD_PLAN_KINDS, ['direct', 'hls', 'dash', 'mux', 'ytdlp']);
  assert.deepEqual(PREFERRED_TRANSPORTS, ['http', 'range', 'curl', 'ffmpeg', 'segments', 'ytdlp']);
});

test('download-plan: capabilities e strategy hints normalizam campos conhecidos', () => {
  assert.deepEqual(createProviderCapabilities({ rangeDownload: 1, refreshAccess: 0 }), {
    rangeDownload: true,
    refreshAccess: false,
  });
  assert.deepEqual(createStrategyHints({
    preferredTransport: 'segments',
    preferBrowserProfile: 1,
    preserveSelectedVariant: 0,
  }), {
    preferredTransport: 'segments',
    preferBrowserProfile: true,
    preserveSelectedVariant: false,
  });
});

test('download-plan: provider resolution aplica defaults e valida shape minimo', () => {
  const resolution = createProviderResolution({
    contractVersion: 2,
    providerId: 'direct',
    matchedBy: 'url',
    confidence: 'high',
    mediaInfo: { kind: 'direct', sourceType: 'direct', provider: 'direct', title: 'Video', variants: [] },
  });

  assert.equal(resolution.contractVersion, 2);
  assert.equal(resolution.providerId, 'direct');
  assert.equal(resolution.matchedBy, 'url');
  assert.equal(resolution.confidence, 'high');
  assert.deepEqual(resolution.requestContext, {
    headers: {},
    cookies: null,
    referer: '',
    origin: '',
    userAgent: '',
    profile: 'default',
  });
  assert.deepEqual(resolution.capabilities, {});
  assert.deepEqual(resolution.strategyHints, {});
  assert.deepEqual(resolution.diagnostics, {});
  assert.equal(resolution.mediaInfo.sourceType, 'direct');
  assert.equal(isValidProviderResolution(resolution), true);
});

test('download-plan: download plan evita duplicar headers fora do requestContext', () => {
  const plan = createDownloadPlan({
    contractVersion: 2,
    kind: 'hls',
    source: { manifestUrl: 'https://cdn.example.com/master.m3u8' },
    requestContext: { headers: { Referer: 'https://page.example' }, profile: 'browser' },
    capabilities: { segmentedDownload: true },
    strategyHints: { preferredTransport: 'ffmpeg' },
    refreshState: { selectionKey: '720p' },
  });

  assert.equal(plan.contractVersion, 2);
  assert.equal(plan.kind, 'hls');
  assert.deepEqual(plan.source, { manifestUrl: 'https://cdn.example.com/master.m3u8' });
  assert.equal(plan.requestContext.headers.Referer, 'https://page.example');
  assert.equal(plan.requestContext.profile, 'browser');
  assert.equal(plan.capabilities.segmentedDownload, true);
  assert.equal(plan.strategyHints.preferredTransport, 'ffmpeg');
  assert.deepEqual(plan.refreshState, { selectionKey: '720p' });
  assert.equal(Object.hasOwn(plan, 'headers'), false);
  assert.equal(isValidDownloadPlan(plan), true);
});

test('download-plan: entradas invalidas lancam TypeError', () => {
  assert.throws(() => createStrategyHints({ preferredTransport: 'ftp' }), TypeError);
  assert.throws(() => createProviderResolution({ providerId: 'x', matchedBy: 'bogus', confidence: 'high' }), TypeError);
  assert.throws(() => createProviderResolution({ providerId: 'x', matchedBy: 'url', confidence: 'certain' }), TypeError);
  assert.throws(() => createDownloadPlan({ kind: 'iso', source: {} }), TypeError);
  assert.throws(() => createDownloadPlan({ kind: 'direct', source: null }), TypeError);
});

test('download-plan: validadores rejeitam shapes incompletos', () => {
  assert.equal(isValidProviderResolution(null), false);
  assert.equal(isValidProviderResolution({ providerId: 'x' }), false);
  assert.equal(isValidDownloadPlan(null), false);
  assert.equal(isValidDownloadPlan({ kind: 'direct', source: {}, requestContext: {}, capabilities: {}, strategyHints: {} }), false);
});
