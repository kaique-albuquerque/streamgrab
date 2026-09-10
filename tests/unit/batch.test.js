import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseBatchUrls, processBatch, buildFilename, MAX_BATCH_URLS } from '../../src/batch.js';

// ---------------------------------------------------------------------------
// parseBatchUrls
// ---------------------------------------------------------------------------

test('parseBatchUrls extrai URLs separadas por linha', () => {
  const urls = parseBatchUrls('https://a.com/video.m3u8\nhttps://b.com/watch?v=1');
  assert.deepEqual(urls, ['https://a.com/video.m3u8', 'https://b.com/watch?v=1']);
});

test('parseBatchUrls aceita vírgula, ponto-e-vírgula e espaço', () => {
  const urls = parseBatchUrls('https://a.com/1,https://b.com/2; https://c.com/3');
  assert.deepEqual(urls, ['https://a.com/1', 'https://b.com/2', 'https://c.com/3']);
});

test('parseBatchUrls remove duplicatas preservando ordem', () => {
  const urls = parseBatchUrls('https://a.com/1\nhttps://b.com/2\nhttps://a.com/1');
  assert.deepEqual(urls, ['https://a.com/1', 'https://b.com/2']);
});

test('parseBatchUrls ignora entradas que não são http(s)', () => {
  const urls = parseBatchUrls('ftp://a.com/1\nnot-a-url\nhttps://ok.com/v.mp4');
  assert.deepEqual(urls, ['https://ok.com/v.mp4']);
});

test('parseBatchUrls retorna [] para entrada inválida', () => {
  assert.deepEqual(parseBatchUrls(null), []);
  assert.deepEqual(parseBatchUrls(''), []);
  assert.deepEqual(parseBatchUrls('   \n  \n'), []);
});

// ---------------------------------------------------------------------------
// buildFilename
// ---------------------------------------------------------------------------

test('buildFilename usa o título quando disponível', () => {
  assert.equal(buildFilename({ title: 'Minha Aula', url: 'https://x.com/a.m3u8' }), 'Minha Aula.mp4');
});

test('buildFilename sanitiza caracteres inválidos do título', () => {
  assert.equal(buildFilename({ title: 'A/B:C*D?', url: 'https://x.com/a.m3u8' }), 'A_B_C_D_.mp4');
});

test('buildFilename deriva do path da URL quando não há título', () => {
  assert.equal(buildFilename({ title: '', url: 'https://x.com/videos/aula-01.m3u8' }), 'aula-01.mp4');
});

test('buildFilename usa "video" como fallback final', () => {
  assert.equal(buildFilename({ title: '', url: 'https://x.com/' }), 'video.mp4');
});

test('buildFilename não duplica extensão .mp4', () => {
  assert.equal(buildFilename({ title: 'aula.mp4', url: 'https://x.com/a.m3u8' }), 'aula.mp4');
});

// ---------------------------------------------------------------------------
// processBatch
// ---------------------------------------------------------------------------

test('processBatch enfileira todas as URLs válidas', async () => {
  const enqueued = [];
  const result = await processBatch({
    urls: ['https://a.com/1', 'https://b.com/2'],
    analyze: async () => ({ media: { title: 'Video' } }),
    enqueue: async (item) => {
      enqueued.push(item);
      return { id: `job-${enqueued.length}` };
    },
  });

  assert.equal(result.ok, 2);
  assert.equal(result.failed, 0);
  assert.equal(enqueued.length, 2);
  assert.equal(result.results[0].jobId, 'job-1');
  assert.equal(result.results[1].jobId, 'job-2');
});

test('processBatch continua após erro de análise (enfileira mesmo assim)', async () => {
  let calls = 0;
  const result = await processBatch({
    urls: ['https://a.com/1'],
    analyze: async () => {
      calls++;
      throw new Error('403');
    },
    enqueue: async () => ({ id: 'job-1' }),
  });

  assert.equal(calls, 1);
  assert.equal(result.ok, 1);
  assert.equal(result.results[0].analysisError, '403');
});

test('processBatch marca erro quando o enqueue falha', async () => {
  const result = await processBatch({
    urls: ['https://a.com/1', 'https://b.com/2'],
    analyze: async () => ({}),
    enqueue: async (item) => {
      if (item.url.includes('b.com')) throw new Error('falha no enqueue');
      return { id: 'job-1' };
    },
  });

  assert.equal(result.ok, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.results[1].error, 'falha no enqueue');
});

test('processBatch reporta progresso por URL', async () => {
  const events = [];
  await processBatch({
    urls: ['https://a.com/1'],
    analyze: async () => ({ media: { title: 'V' } }),
    enqueue: async () => ({ id: 'job-1' }),
    onProgress: (data) => events.push(data.status),
  });

  assert.deepEqual(events, ['analyzing', 'enqueued']);
});

test('processBatch trunca em MAX_BATCH_URLS', async () => {
  const urls = Array.from({ length: MAX_BATCH_URLS + 5 }, (_, i) => `https://a.com/${i}`);
  const result = await processBatch({
    urls,
    analyze: async () => ({}),
    enqueue: async () => ({ id: 'x' }),
  });

  assert.equal(result.results.length, MAX_BATCH_URLS);
  assert.equal(result.truncated, true);
});

test('processBatch com lista vazia retorna erro', async () => {
  const result = await processBatch({ urls: [], analyze: async () => ({}), enqueue: async () => ({}) });
  assert.equal(result.ok, 0);
  assert.ok(result.error);
});

test('processBatch passa outputDir e options ao enqueue', async () => {
  let captured = null;
  await processBatch({
    urls: ['https://a.com/1'],
    outputDir: '/tmp/videos',
    options: { turbo: true },
    analyze: async () => ({ media: { title: 'V' } }),
    enqueue: async (item) => {
      captured = item;
      return { id: 'job-1' };
    },
  });

  assert.equal(captured.outputDir, '/tmp/videos');
  assert.equal(captured.options.turbo, true);
  assert.equal(captured.filename, 'V.mp4');
});
