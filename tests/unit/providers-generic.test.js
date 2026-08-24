import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { genericProvider } from '../../src/providers/generic/index.js';
import { analyzeGenericPage } from '../../src/providers/generic/page-analyzer.js';
import { discoverManifestCandidates } from '../../src/providers/generic/manifest-discovery.js';

function withServer(handler, fn) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      fn(`http://127.0.0.1:${port}`)
        .then((result) => {
          server.close();
          resolve(result);
        })
        .catch((err) => {
          server.close();
          reject(err);
        });
    });
  });
}

test('generic provider: discoverManifestCandidates encontra HLS, DASH e direto em HTML', () => {
  const html = `
    <html>
      <body>
        <video src="/media/video.mp4"></video>
        <script>var master = "https://cdn.example.com/master.m3u8";</script>
        <a href="/dash/manifest.mpd">dash</a>
      </body>
    </html>
  `;
  const candidates = discoverManifestCandidates(html, 'https://page.example/watch');
  assert.ok(candidates.some((item) => item.mediaType === 'hls' && item.candidateUrl.includes('master.m3u8')));
  assert.ok(candidates.some((item) => item.mediaType === 'dash' && item.candidateUrl.includes('manifest.mpd')));
  assert.ok(candidates.some((item) => item.mediaType === 'direct' && item.candidateUrl.includes('video.mp4')));
});

test('generic provider: analyzeGenericPage coleta candidatos e players conhecidos', async () => {
  const html = `
    <html>
      <head><script src="/assets/hls.js"></script></head>
      <body><script>window.src = "/stream/master.m3u8";</script></body>
    </html>
  `;
  const result = await withServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
  }, async (base) => analyzeGenericPage(`${base}/watch`));

  assert.ok(result.finalUrl.endsWith('/watch'));
  assert.ok(result.candidates.length >= 1);
  assert.equal(result.candidates[0].mediaType, 'hls');
  assert.ok(result.players.some((item) => item.player === 'hls.js'));
});

test('generic provider: resolve HTML com HLS devolve ProviderResolution high/medium seguro', async () => {
  const html = `
    <html>
      <body>
        <script>window.playlist = "/stream/master.m3u8";</script>
      </body>
    </html>
  `;
  const resolution = await withServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
  }, async (base) => genericProvider.resolve({
    url: `${base}/watch`,
    headers: { Authorization: 'Bearer abc' },
  }));

  assert.equal(resolution.providerId, 'generic');
  assert.equal(resolution.kind, 'hls');
  assert.ok(['high', 'medium'].includes(resolution.confidence));
  assert.ok(resolution.manifestUrl.includes('/stream/master.m3u8'));
  assert.equal(resolution.requestContext.headers.Authorization, 'Bearer abc');
  assert.ok(resolution.requestContext.referer.endsWith('/watch'));
  assert.equal(resolution.strategyHints.preferredTransport, 'ffmpeg');
});

test('generic provider: resolve falha com seguranca quando nao encontra evidencia suficiente', async () => {
  await assert.rejects(
    withServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body><p>sem midia aqui</p></body></html>');
    }, async (base) => genericProvider.resolve({ url: `${base}/empty` })),
    (err) => err.code === 'UNSUPPORTED_SOURCE',
  );
});

test('generic provider: prepareDownloadPlan retorna plano para HLS e direto', async () => {
  const hlsPlan = await genericProvider.prepareDownloadPlan({
    url: 'https://page.example/watch',
    selectedUrl: 'https://cdn.example.com/master.m3u8',
    analysis: { sourceType: 'hls' },
    headers: { Referer: 'https://caller.example' },
  });
  assert.equal(hlsPlan.kind, 'hls');
  assert.deepEqual(hlsPlan.source, { manifestUrl: 'https://cdn.example.com/master.m3u8' });

  const directPlan = await genericProvider.prepareDownloadPlan({
    url: 'https://page.example/watch',
    selectedUrl: 'https://cdn.example.com/video.mp4',
    analysis: { sourceType: 'direct' },
  });
  assert.equal(directPlan.kind, 'direct');
  assert.deepEqual(directPlan.source, { url: 'https://cdn.example.com/video.mp4' });
});
