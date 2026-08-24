import { test } from 'node:test';
import assert from 'node:assert/strict';

import { prepareProviderDownload, resolveProvider } from '../../src/providers/base.js';

test('providers-compat: resolveProvider adapta provider legado direct para ProviderResolution', async () => {
  const provider = {
    id: 'direct',
    label: 'Direct',
    priority: 10,
    detect: () => true,
    supportsQualitySelection: false,
    async analyze() {
      return {
        kind: 'direct',
        sourceType: 'direct',
        provider: 'direct',
        title: 'Video',
        variants: [],
      };
    },
    async prepareDownload({ url }) {
      return { downloadUrl: url };
    },
  };

  const resolution = await resolveProvider(provider, {
    url: 'https://cdn.example.com/video.mp4',
    headers: { Referer: 'https://page.example' },
  });

  assert.equal(resolution.contractVersion, 2);
  assert.equal(resolution.providerId, 'direct');
  assert.equal(resolution.kind, 'direct');
  assert.equal(resolution.matchedBy, 'url');
  assert.equal(resolution.confidence, 'high');
  assert.equal(resolution.mediaUrl, 'https://cdn.example.com/video.mp4');
  assert.equal(resolution.requestContext.headers.Referer, 'https://page.example');
  assert.equal(resolution.capabilities.qualitySelection, false);
  assert.equal(resolution.capabilities.rangeDownload, true);
  assert.equal(resolution.mediaInfo.sourceType, 'direct');
});

test('providers-compat: prepareProviderDownload adapta downloadUrl simples para DownloadPlan direct', async () => {
  const provider = {
    id: 'direct',
    label: 'Direct',
    priority: 10,
    detect: () => true,
    async analyze() { return {}; },
    async prepareDownload({ url }) {
      return { downloadUrl: url };
    },
  };

  const plan = await prepareProviderDownload(provider, {
    url: 'https://cdn.example.com/video.mp4',
    headers: { Authorization: 'Bearer abc' },
    options: { turbo: true },
  });

  assert.equal(plan.contractVersion, 2);
  assert.equal(plan.kind, 'direct');
  assert.deepEqual(plan.source, { url: 'https://cdn.example.com/video.mp4' });
  assert.equal(plan.requestContext.headers.Authorization, 'Bearer abc');
  assert.equal(plan.strategyHints.preferredTransport, 'range');
  assert.equal(plan.capabilities.rangeDownload, true);
});

test('providers-compat: prepareProviderDownload adapta mux do ytdlp para DownloadPlan mux', async () => {
  const provider = {
    id: 'ytdlp',
    label: 'yt-dlp',
    priority: 100,
    detect: () => true,
    supportsQualitySelection: true,
    async analyze() { return { kind: 'ytdlp', sourceType: 'ytdlp', variants: [] }; },
    async prepareDownload() {
      return {
        strategy: 'mux',
        videoUrl: 'https://cdn.example.com/video.mp4',
        audioUrl: 'https://cdn.example.com/audio.m4a',
        formatId: '137+140',
      };
    },
  };

  const plan = await prepareProviderDownload(provider, {
    url: 'https://www.youtube.com/watch?v=abc',
    selectedUrl: 'ytdlp-format:137',
    formatId: '137+140',
    analysis: { sourceType: 'ytdlp' },
  });

  assert.equal(plan.kind, 'mux');
  assert.deepEqual(plan.source, {
    videoUrl: 'https://cdn.example.com/video.mp4',
    audioUrl: 'https://cdn.example.com/audio.m4a',
    formatId: '137+140',
  });
  assert.equal(plan.strategyHints.preferredTransport, 'ytdlp');
  assert.equal(plan.capabilities.qualitySelection, true);
  assert.equal(plan.selectedFormat.formatId, '137+140');
});

test('providers-compat: provider V2 passa direto por resolveProvider', async () => {
  const expected = {
    contractVersion: 2,
    providerId: 'generic',
    matchedBy: 'fallback',
    confidence: 'low',
    requestContext: { headers: {}, cookies: null, referer: '', origin: '', userAgent: '', profile: 'default' },
    capabilities: {},
    strategyHints: {},
    diagnostics: {},
  };

  const provider = {
    id: 'generic',
    label: 'Generic',
    priority: 1,
    detect: () => true,
    async resolve() {
      return expected;
    },
    async prepareDownload() {
      return {
        kind: 'direct',
        source: { url: 'https://example.com/video.mp4' },
        requestContext: expected.requestContext,
        capabilities: {},
        strategyHints: {},
      };
    },
  };

  const resolution = await resolveProvider(provider, { url: 'https://example.com/page' });
  assert.equal(resolution, expected);
});
