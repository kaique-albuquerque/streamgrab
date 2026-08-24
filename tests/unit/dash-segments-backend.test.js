import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { inspectDashSegmentSupport, prepareDashSegmentDownloadToLocal } from '../../src/transports/backends/dash-segments.js';

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
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function stopServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('dash-segments backend: rejeita MPD nao static com fallback seguro', () => {
  const support = inspectDashSegmentSupport({
    kind: 'dash',
    type: 'dynamic',
    representations: [],
    videoRepresentations: [{ id: 'v1', baseUrl: 'video.mp4', segmentBase: {} }],
  });
  assert.equal(support.ok, false);
  assert.equal(support.code, 'MANIFEST_UNSUPPORTED');
  assert.equal(support.reasonCode, 'dash-live-unsupported');
});

test('dash-segments backend: baixa video+audio locais e retorna modo mux', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-dash-segments-'));
  const mpd = `<?xml version="1.0" encoding="UTF-8"?>
  <MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static">
    <Period>
      <AdaptationSet mimeType="video/mp4" contentType="video">
        <Representation id="video-720" bandwidth="2500000" width="1280" height="720">
          <BaseURL>video.mp4</BaseURL>
          <SegmentBase indexRange="10-20"><Initialization range="0-9"/></SegmentBase>
        </Representation>
      </AdaptationSet>
      <AdaptationSet mimeType="audio/mp4" contentType="audio">
        <Representation id="audio-128" bandwidth="128000">
          <BaseURL>audio.m4a</BaseURL>
          <SegmentBase indexRange="10-20"><Initialization range="0-9"/></SegmentBase>
        </Representation>
      </AdaptationSet>
    </Period>
  </MPD>`;
  const server = await startServer({
    '/manifest.mpd': { headers: { 'Content-Type': 'application/dash+xml' }, body: mpd },
    '/video.mp4': { body: Buffer.from('video-data') },
    '/audio.m4a': { body: Buffer.from('audio-data') },
  });
  try {
    const port = server.address().port;
    const progress = [];
    const result = await prepareDashSegmentDownloadToLocal({
      url: `http://127.0.0.1:${port}/manifest.mpd`,
      tmpDir,
      onProgress: (p) => progress.push(p),
    });
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'mux');
    assert.ok(fs.existsSync(result.videoPath));
    assert.ok(fs.existsSync(result.audioPath));
    assert.equal(fs.readFileSync(result.videoPath, 'utf8'), 'video-data');
    assert.equal(fs.readFileSync(result.audioPath, 'utf8'), 'audio-data');
    assert.equal(result.diagnostics.videoRepresentationId, 'video-720');
    assert.equal(result.diagnostics.audioRepresentationId, 'audio-128');
    assert.ok(progress.some((p) => p.queue === 'video'));
    assert.ok(progress.some((p) => p.queue === 'audio'));
  } finally {
    await stopServer(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('dash-segments backend: sem audio retorna modo single', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-dash-segments-single-'));
  const mpd = `<?xml version="1.0" encoding="UTF-8"?>
  <MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static">
    <Period>
      <AdaptationSet mimeType="video/mp4" contentType="video">
        <Representation id="video-360" bandwidth="800000" width="640" height="360">
          <BaseURL>video.mp4</BaseURL>
          <SegmentBase indexRange="10-20"><Initialization range="0-9"/></SegmentBase>
        </Representation>
      </AdaptationSet>
    </Period>
  </MPD>`;
  const server = await startServer({
    '/manifest.mpd': { headers: { 'Content-Type': 'application/dash+xml' }, body: mpd },
    '/video.mp4': { body: Buffer.from('video-only') },
  });
  try {
    const port = server.address().port;
    const result = await prepareDashSegmentDownloadToLocal({
      url: `http://127.0.0.1:${port}/manifest.mpd`,
      tmpDir,
    });
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'single');
    assert.ok(fs.existsSync(result.videoPath));
    assert.equal(result.audioPath, '');
  } finally {
    await stopServer(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('dash-segments backend: adaptive controller emite decisoes e mantem mux valido', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-dash-segments-adaptive-'));
  const decisions = [];
  const progress = [];
  const checkpoints = [];
  const mpd = `<?xml version="1.0" encoding="UTF-8"?>
  <MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static">
    <Period>
      <AdaptationSet mimeType="video/mp4" contentType="video">
        <Representation id="video-720" bandwidth="2500000" width="1280" height="720">
          <BaseURL>video.mp4</BaseURL>
          <SegmentBase indexRange="10-20"><Initialization range="0-9"/></SegmentBase>
        </Representation>
      </AdaptationSet>
      <AdaptationSet mimeType="audio/mp4" contentType="audio">
        <Representation id="audio-128" bandwidth="128000">
          <BaseURL>audio.m4a</BaseURL>
          <SegmentBase indexRange="10-20"><Initialization range="0-9"/></SegmentBase>
        </Representation>
      </AdaptationSet>
    </Period>
  </MPD>`;
  const server = await startServer({
    '/manifest.mpd': { headers: { 'Content-Type': 'application/dash+xml' }, body: mpd },
    '/video.mp4': { body: Buffer.from('video-data') },
    '/audio.m4a': { body: Buffer.from('audio-data') },
  });
  try {
    const port = server.address().port;
    const result = await prepareDashSegmentDownloadToLocal({
      url: `http://127.0.0.1:${port}/manifest.mpd`,
      tmpDir,
      adaptive: { min: 1, max: 2, initial: 1, windowMs: 50, rampUpSamples: 2 },
      onAdaptiveDecision: (d) => decisions.push(d),
      onProgress: (p) => progress.push(p),
      onCheckpoint: (checkpoint) => checkpoints.push(checkpoint),
    });
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'mux');
    assert.equal(result.diagnostics.adaptive.enabled, true);
    assert.ok(decisions.length >= 1, 'adaptive controller deve emitir ao menos uma decisao');
    assert.ok(progress.some((p) => typeof p.concurrency === 'number'), 'progresso deve expor concurrency atual');
    assert.ok(checkpoints.length >= 2, 'checkpoint deve ser emitido durante o preparo');
    assert.equal(checkpoints.at(-1).taskState, 'downloaded');
    assert.deepEqual(
      checkpoints.at(-1).completedSegmentIds.sort(),
      ['audio:audio-128:init:0', 'video:video-720:init:0'].sort()
    );
  } finally {
    await stopServer(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('dash-segments backend: reaproveita checkpoint anterior e pula trilha ja baixada', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-dash-segments-resume-'));
  const hits = { video: 0, audio: 0 };
  const mpd = `<?xml version="1.0" encoding="UTF-8"?>
  <MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static">
    <Period>
      <AdaptationSet mimeType="video/mp4" contentType="video">
        <Representation id="video-720" bandwidth="2500000" width="1280" height="720">
          <BaseURL>video.mp4</BaseURL>
          <SegmentBase indexRange="10-20"><Initialization range="0-9"/></SegmentBase>
        </Representation>
      </AdaptationSet>
      <AdaptationSet mimeType="audio/mp4" contentType="audio">
        <Representation id="audio-128" bandwidth="128000">
          <BaseURL>audio.m4a</BaseURL>
          <SegmentBase indexRange="10-20"><Initialization range="0-9"/></SegmentBase>
        </Representation>
      </AdaptationSet>
    </Period>
  </MPD>`;
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://x').pathname;
    if (pathname === '/manifest.mpd') {
      res.writeHead(200, { 'Content-Type': 'application/dash+xml' });
      res.end(mpd);
      return;
    }
    if (pathname === '/video.mp4') {
      hits.video += 1;
      const body = Buffer.from('video-data');
      res.writeHead(200, { 'Content-Length': body.length });
      res.end(body);
      return;
    }
    if (pathname === '/audio.m4a') {
      hits.audio += 1;
      const body = Buffer.from('audio-data');
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
    fs.writeFileSync(path.join(tmpDir, 'video.mp4'), 'video-data');
    const checkpoints = [];

    const result = await prepareDashSegmentDownloadToLocal({
      url: `http://127.0.0.1:${port}/manifest.mpd`,
      tmpDir,
      checkpoint: {
        backend: 'dash-segments',
        manifestUrl: `http://127.0.0.1:${port}/manifest.mpd`,
        outputMode: 'mux',
        taskState: 'downloading',
        completedSegmentIds: ['video:video-720:init:0'],
      },
      onCheckpoint: (checkpoint) => checkpoints.push(checkpoint),
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'mux');
    assert.equal(hits.video, 0, 'video retomado nao deve ser rebaixado');
    assert.equal(hits.audio, 1, 'somente a trilha pendente deve ser baixada');
    assert.equal(result.diagnostics.resumedSegmentCount, 2);
    assert.equal(checkpoints.at(-1).taskState, 'downloaded');
    assert.deepEqual(
      checkpoints.at(-1).completedSegmentIds.sort(),
      ['audio:audio-128:init:0', 'video:video-720:init:0'].sort()
    );
  } finally {
    await stopServer(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
