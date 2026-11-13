// A duracao do HLS precisa chegar ao plano de download: `toLegacyPrepared`
// le `plan.source.durationMs`, mas o provider nao preenchia o campo. Sem ele
// o FFmpeg cai na estimativa por bytes e a barra fica imprecisa.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';

import { hlsProvider } from '../../src/providers/hls/index.js';

const MASTER = ['#EXTM3U', '#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360', 'media.m3u8', ''].join('\n');

const MEDIA = [
  '#EXTM3U',
  '#EXT-X-TARGETDURATION:10',
  '#EXTINF:10.0,',
  'seg0.ts',
  '#EXTINF:6.5,',
  'seg1.ts',
  '#EXTINF:3.5,',
  'seg2.ts',
  '#EXT-X-ENDLIST',
  '',
].join('\n');

/** Sobe um servidor servindo master + media playlist. */
function withServer(fn) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' });
      res.end(req.url.endsWith('master.m3u8') ? MASTER : MEDIA);
    });
    server.listen(0, '127.0.0.1', async () => {
      try {
        resolve(await fn(`http://127.0.0.1:${server.address().port}`));
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

test('hls provider: analyze media playlist expoe a duracao total (#EXTINF)', () =>
  withServer(async (base) => {
    const info = await hlsProvider.analyze({ url: `${base}/media.m3u8` });
    assert.equal(info.durationSeconds, 20, 'soma de 10 + 6.5 + 3.5');
  }));

test('hls provider: o plano de download carrega durationMs do analisado', () =>
  withServer(async (base) => {
    // Serve a media playlist como "master" selecionavel: o plano precisa da
    // media analisada para saber a duracao total.
    const info = await hlsProvider.analyze({ url: `${base}/media.m3u8` });
    const plan = await hlsProvider.prepareDownloadPlan({
      url: `${base}/media.m3u8`,
      headers: {},
      analysis: info,
    });

    assert.equal(plan.kind, 'hls');
    assert.equal(plan.source.durationMs, 20000, 'duracao em ms no source do plano');
  }));
