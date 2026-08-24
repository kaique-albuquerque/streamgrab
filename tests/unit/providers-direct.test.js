// Unit: provider direct (P3/P5) - deteccao, contratos legado e V2.
// Sem rede externa: midia direta nao depende de fetch para analise.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { directProvider } from '../../src/providers/direct/index.js';

test('direct provider: detect reconhece URLs de midia direta e rejeita HLS/DASH/paginas', () => {
  assert.equal(directProvider.detect('https://cdn.example.com/video.mp4'), true);
  assert.equal(directProvider.detect('https://cdn.example.com/clip.ts?token=abc'), true);
  assert.equal(directProvider.detect('https://rr1---sn.example.googlevideo.com/videoplayback?id=abc'), true);

  assert.equal(directProvider.detect('https://cdn.example.com/index.m3u8'), false);
  assert.equal(directProvider.detect('https://cdn.example.com/manifest.mpd'), false);
  assert.equal(directProvider.detect('https://cdn.example.com/embed/page'), false);
});

test('direct provider: analyze retorna MediaInfo normalizado sem tocar a rede', async () => {
  const info = await directProvider.analyze({ url: 'https://cdn.example.com/video.mp4' });
  assert.equal(info.kind, 'direct');
  assert.equal(info.sourceType, 'direct');
  assert.equal(info.provider, 'direct');
  assert.equal(info.title, 'Video');
  assert.deepEqual(info.variants, []);
  assert.deepEqual(info.formats, []);
});

test('direct provider: resolve retorna ProviderResolution nativo V2', async () => {
  const resolution = await directProvider.resolve({
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
  assert.equal(resolution.capabilities.rangeDownload, true);
  assert.equal(resolution.strategyHints.preferredTransport, 'http');
});

test('direct provider: getFormats retorna vazio', () => {
  assert.deepEqual(directProvider.getFormats({}), []);
});

test('direct provider: prepareDownloadPlan retorna DownloadPlan nativo V2', async () => {
  const plan = await directProvider.prepareDownloadPlan({
    url: 'https://cdn.example.com/video.mp4?token=abc',
    headers: { Authorization: 'Bearer abc' },
    options: { turbo: true },
  });

  assert.equal(plan.contractVersion, 2);
  assert.equal(plan.kind, 'direct');
  assert.deepEqual(plan.source, { url: 'https://cdn.example.com/video.mp4?token=abc' });
  assert.equal(plan.requestContext.headers.Authorization, 'Bearer abc');
  assert.equal(plan.capabilities.rangeDownload, true);
  assert.equal(plan.strategyHints.preferredTransport, 'range');
});

test('direct provider: prepareDownload devolve a propria URL', async () => {
  const url = 'https://cdn.example.com/video.mp4?token=abc';
  const plan = await directProvider.prepareDownload({ url });
  assert.deepEqual(plan, { downloadUrl: url });
});
