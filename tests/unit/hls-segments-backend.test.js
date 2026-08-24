import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { inspectHlsSegmentSupport, prepareHlsSegmentDownloadToLocal } from '../../src/transports/backends/hls-segments.js';

function startServer(routes) {
  const server = http.createServer((req, res) => {
    const route = routes[new URL(req.url, 'http://x').pathname];
    if (!route) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const body = Buffer.isBuffer(route.body) ? route.body : Buffer.from(route.body);
    res.writeHead(route.status || 200, route.headers || { 'Content-Length': body.length });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function stopServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('hls-segments backend: rejeita BYTERANGE com fallback seguro', () => {
  const support = inspectHlsSegmentSupport([
    '#EXTM3U',
    '#EXT-X-TARGETDURATION:4',
    '#EXT-X-BYTERANGE:100@0',
    '#EXTINF:4,',
    'seg.ts',
    '#EXT-X-ENDLIST',
    '',
  ].join('\n'));
  assert.equal(support.ok, false);
  assert.equal(support.code, 'MANIFEST_UNSUPPORTED');
  assert.equal(support.reasonCode, 'hls-byterange-unsupported');
});

test('hls-segments backend: rejeita playlist live sem ENDLIST com fallback seguro', () => {
  const support = inspectHlsSegmentSupport([
    '#EXTM3U',
    '#EXT-X-TARGETDURATION:4',
    '#EXTINF:4,',
    'seg.ts',
    '',
  ].join('\n'));
  assert.equal(support.ok, false);
  assert.equal(support.code, 'MANIFEST_UNSUPPORTED');
  assert.equal(support.reasonCode, 'hls-live-unsupported');
});

test('hls-segments backend: baixa playlist media simples para playlist local', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-hls-segments-test-'));
  const server = await startServer({
    '/media.m3u8': {
      headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
      body: ['#EXTM3U', '#EXT-X-TARGETDURATION:4', '#EXTINF:4,', 'seg0.ts', '#EXTINF:4,', 'seg1.ts', '#EXT-X-ENDLIST', ''].join('\n'),
    },
    '/seg0.ts': { body: Buffer.from('segment-0') },
    '/seg1.ts': { body: Buffer.from('segment-1') },
  });
  try {
    const port = server.address().port;
    const result = await prepareHlsSegmentDownloadToLocal({
      url: `http://127.0.0.1:${port}/media.m3u8`,
      tmpDir,
    });
    assert.equal(result.ok, true);
    assert.ok(fs.existsSync(result.localPlaylist));
    const playlist = fs.readFileSync(result.localPlaylist, 'utf8');
    assert.match(playlist, /seg_00000\.ts/);
    assert.match(playlist, /seg_00001\.ts/);
    assert.equal(result.diagnostics.segmentCount, 2);
  } finally {
    await stopServer(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('hls-segments backend: baixa AES-128 e fMP4 e reescreve referencias locais', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-hls-segments-enc-'));
  const server = await startServer({
    '/media.m3u8': {
      headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
      body: [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:4',
        '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
        '#EXT-X-MAP:URI="init.mp4"',
        '#EXTINF:4,',
        'seg0.m4s',
        '#EXT-X-ENDLIST',
        '',
      ].join('\n'),
    },
    '/key.bin': { body: Buffer.from([1, 2, 3, 4]) },
    '/init.mp4': { body: Buffer.from('init-data') },
    '/seg0.m4s': { body: Buffer.from('segment-data') },
  });
  try {
    const port = server.address().port;
    const result = await prepareHlsSegmentDownloadToLocal({
      url: `http://127.0.0.1:${port}/media.m3u8`,
      tmpDir,
    });
    assert.equal(result.ok, true);
    const playlist = fs.readFileSync(result.localPlaylist, 'utf8');
    assert.match(playlist, /URI="key_0\.bin"/);
    assert.match(playlist, /URI="init_0\.mp4"/);
    assert.match(playlist, /seg_00000\.m4s/);
    assert.equal(result.diagnostics.keyCount, 1);
    assert.equal(result.diagnostics.mapCount, 1);
  } finally {
    await stopServer(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('hls-segments backend: master playlist respeita preferredVariantPath ao escolher a variante', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-hls-segments-master-'));
  const server = await startServer({
    '/master.m3u8': {
      headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
      body: [
        '#EXTM3U',
        '#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360',
        'v360/media.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720',
        'v720/media.m3u8',
        '',
      ].join('\n'),
    },
    '/v360/media.m3u8': {
      headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
      body: ['#EXTM3U', '#EXT-X-TARGETDURATION:4', '#EXTINF:4,', 'seg360.ts', '#EXT-X-ENDLIST', ''].join('\n'),
    },
    '/v720/media.m3u8': {
      headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
      body: ['#EXTM3U', '#EXT-X-TARGETDURATION:4', '#EXTINF:4,', 'seg720.ts', '#EXT-X-ENDLIST', ''].join('\n'),
    },
    '/v360/seg360.ts': { body: Buffer.from('segment-360') },
    '/v720/seg720.ts': { body: Buffer.from('segment-720') },
  });
  try {
    const port = server.address().port;
    const result = await prepareHlsSegmentDownloadToLocal({
      url: `http://127.0.0.1:${port}/master.m3u8`,
      preferredVariantPath: '/v720/media.m3u8',
      tmpDir,
    });
    assert.equal(result.ok, true);
    const playlist = fs.readFileSync(result.localPlaylist, 'utf8');
    assert.match(playlist, /seg_00000\.ts/);
    assert.ok(fs.existsSync(path.join(tmpDir, 'seg_00000.ts')));
    const segmentBody = fs.readFileSync(path.join(tmpDir, 'seg_00000.ts')).toString('utf8');
    assert.equal(segmentBody, 'segment-720');
  } finally {
    await stopServer(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('hls-segments backend: adaptive controller emite decisoes e mantem download valido', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-hls-segments-adaptive-'));
  const decisions = [];
  const progress = [];
  const checkpoints = [];
  const server = await startServer({
    '/media.m3u8': {
      headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
      body: [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:1',
        '#EXTINF:1,',
        'seg0.ts',
        '#EXTINF:1,',
        'seg1.ts',
        '#EXTINF:1,',
        'seg2.ts',
        '#EXTINF:1,',
        'seg3.ts',
        '#EXT-X-ENDLIST',
        '',
      ].join('\n'),
    },
    '/seg0.ts': { body: Buffer.from('segment-0') },
    '/seg1.ts': { body: Buffer.from('segment-1') },
    '/seg2.ts': { body: Buffer.from('segment-2') },
    '/seg3.ts': { body: Buffer.from('segment-3') },
  });
  try {
    const port = server.address().port;
    const result = await prepareHlsSegmentDownloadToLocal({
      url: `http://127.0.0.1:${port}/media.m3u8`,
      tmpDir,
      adaptive: { min: 1, max: 4, initial: 1, windowMs: 50, rampUpSamples: 2 },
      onAdaptiveDecision: (d) => decisions.push(d),
      onProgress: (p) => progress.push(p),
      onCheckpoint: (checkpoint) => checkpoints.push(checkpoint),
    });
    assert.equal(result.ok, true);
    assert.equal(result.diagnostics.adaptive.enabled, true);
    assert.ok(decisions.length >= 1, 'adaptive controller deve emitir ao menos uma decisao');
    assert.ok(progress.some((p) => typeof p.concurrency === 'number'), 'progresso deve expor concurrency atual');
    assert.ok(checkpoints.length >= 2, 'checkpoint deve ser emitido durante o preparo');
    assert.equal(checkpoints.at(-1).taskState, 'downloaded');
    assert.ok(checkpoints.at(-1).completedSegmentIds.length >= 1);
    assert.match(checkpoints.at(-1).segments[0].id, /^video:/);
  } finally {
    await stopServer(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('hls-segments backend: reaproveita checkpoint anterior e pula segmentos ja baixados', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-hls-segments-resume-'));
  const hits = { seg0: 0, seg1: 0 };
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://x').pathname;
    if (pathname === '/media.m3u8') {
      const body = ['#EXTM3U', '#EXT-X-TARGETDURATION:4', '#EXTINF:4,', 'seg0.ts', '#EXTINF:4,', 'seg1.ts', '#EXT-X-ENDLIST', ''].join('\n');
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Content-Length': Buffer.byteLength(body) });
      res.end(body);
      return;
    }
    if (pathname === '/seg0.ts') {
      hits.seg0 += 1;
      const body = Buffer.from('segment-0');
      res.writeHead(200, { 'Content-Length': body.length });
      res.end(body);
      return;
    }
    if (pathname === '/seg1.ts') {
      hits.seg1 += 1;
      const body = Buffer.from('segment-1');
      res.writeHead(200, { 'Content-Length': body.length });
      res.end(body);
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    const resumedSegment = path.join(tmpDir, 'seg_00000.ts');
    fs.writeFileSync(resumedSegment, 'segment-0');
    const checkpoints = [];

    const result = await prepareHlsSegmentDownloadToLocal({
      url: `http://127.0.0.1:${port}/media.m3u8`,
      tmpDir,
      checkpoint: {
        backend: 'hls-segments',
        manifestUrl: `http://127.0.0.1:${port}/media.m3u8`,
        outputMode: 'single',
        taskState: 'downloading',
        completedSegmentIds: ['video:/media.m3u8:seg:0'],
      },
      onCheckpoint: (checkpoint) => checkpoints.push(checkpoint),
    });

    assert.equal(result.ok, true);
    assert.equal(hits.seg0, 0, 'segmento retomado nao deve ser rebaixado');
    assert.equal(hits.seg1, 1, 'somente o segmento pendente deve ser baixado');
    assert.equal(result.diagnostics.resumedSegmentCount, 2);
    assert.equal(checkpoints.at(-1).taskState, 'downloaded');
    assert.deepEqual(checkpoints.at(-1).completedSegmentIds.sort(), ['video:/media.m3u8:seg:0', 'video:/media.m3u8:seg:1'].sort());
  } finally {
    await stopServer(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
