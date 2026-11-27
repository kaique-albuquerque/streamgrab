import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';

import { dashMediaSegmentUrls, parseDashManifest, fetchDashManifest, fetchDashManifestText } from '../../src/dash.js';
import { DEFAULT_USER_AGENT } from '../../src/utils.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'dash');

function fixture(name) {
  return readFileSync(path.join(FIXTURES, name), 'utf8');
}

// ---- parseDashManifest ----
test('dash parseDashManifest: representacoes, videoRepresentations ordenadas e contentType', () => {
  const parsed = parseDashManifest(fixture('manifest.mpd'), 'https://dash.example.com/manifest.mpd');
  assert.equal(parsed.kind, 'dash');
  assert.equal(parsed.baseUrl, 'https://dash.example.com/manifest.mpd');
  assert.equal(parsed.representations.length, 3);

  const videoReps = parsed.videoRepresentations;
  assert.equal(videoReps.length, 2);
  assert.equal(videoReps[0].height, 720);
  assert.equal(videoReps[0].width, 1280);
  assert.equal(videoReps[0].bandwidth, 2500000);
  assert.equal(videoReps[0].codecs, 'avc1.640028');
  assert.equal(videoReps[0].baseUrl, 'video/720.mp4');
  assert.equal(videoReps[1].height, 360);
  assert.equal(videoReps[1].bandwidth, 800000);

  const audioRep = parsed.representations.find((r) => r.contentType === 'audio');
  assert.ok(audioRep, 'representacao de audio presente');
  assert.equal(audioRep.baseUrl, 'audio/128.m4a');
  assert.equal(audioRep.codecs, 'mp4a.40.2');
});

test('dash parseDashManifest: manifest sem Initialization nao quebra', () => {
  const parsed = parseDashManifest(fixture('manifest-no-init.mpd'), 'https://dash.example.com/no-init.mpd');
  assert.equal(parsed.representations.length, 1);
  assert.equal(parsed.representations[0].height, 1080);
});

test('dash parseDashManifest: texto sem AdaptationSet retorna kind dash com 0 representacoes', () => {
  const parsed = parseDashManifest('<html>erro</html>', 'https://dash.example.com/x.mpd');
  assert.equal(parsed.kind, 'dash');
  assert.equal(parsed.representations.length, 0);
});

// ---- fetchDashManifest (servidor local) ----
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

test('dash fetchDashManifest: servidor local retorna manifest parseado', async () => {
  const result = await withServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/dash+xml' });
    res.end(fixture('manifest.mpd'));
  }, async (base) => {
    const parsed = await fetchDashManifest(`${base}/manifest.mpd`);
    assert.equal(parsed.kind, 'dash');
    assert.equal(parsed.videoRepresentations.length, 2);
    return parsed;
  });
  assert.equal(result.kind, 'dash');
});

test('dash fetchDashManifest: 403 lanca Error com status', async () => {
  await assert.rejects(
    withServer((req, res) => {
      res.writeHead(403, 'Forbidden');
      res.end('denied');
    }, async (base) => fetchDashManifest(`${base}/manifest.mpd`)),
    (err) => {
      assert.equal(err.status, 403);
      assert.match(err.message, /HTTP 403/);
      return true;
    }
  );
});

test('dash fetchDashManifestText: envia User-Agent padrao no request', async () => {
  let seenUA = null;
  await withServer((req, res) => {
    seenUA = req.headers['user-agent'];
    res.writeHead(200, { 'content-type': 'application/dash+xml' });
    res.end(fixture('manifest.mpd'));
  }, async (base) => {
    await fetchDashManifestText(`${base}/manifest.mpd`);
    assert.equal(seenUA, DEFAULT_USER_AGENT, 'UA padrao presente no request');
  });
});

// ---- SegmentTemplate (DASH-IF / CMFC) ----
test('dash parseDashManifest: SegmentTemplate no AdaptationSet gera init+media por representacao', () => {
  const parsed = parseDashManifest(fixture('manifest-template.mpd'), 'https://cdn.example.com/dash/manifest.mpd');
  assert.equal(parsed.kind, 'dash');
  assert.equal(parsed.type, 'static');
  assert.ok(parsed.durationSeconds > 300, 'duracao vem do mediaPresentationDuration');

  const video = parsed.videoRepresentations;
  assert.equal(video.length, 3);
  // ordenado por altura desc: 1080, 720, 360
  assert.deepEqual(video.map((v) => v.height), [1080, 720, 360]);
  const top = video[0];
  assert.ok(top.segmentTemplate, 'representacao deve ter segmentTemplate');
  assert.match(top.segmentTemplate.initialization, /1920x1080p_30Hz_8\.5Mbps_qvbrinit\.mp4$/);
  assert.match(top.segmentTemplate.media, /1920x1080p_30Hz_8\.5Mbps_qvbr_000000001\.mp4$/);
  // $RepresentationID$ e $Number%09d$ resolvidos
  assert.ok(!top.segmentTemplate.media.includes('$'));
  assert.ok(top.segmentTemplate.media.startsWith('https://cdn.example.com/dash/'));

  const audio = parsed.audioRepresentations[0];
  assert.ok(audio, 'representacao de audio presente');
  assert.match(audio.segmentTemplate.initialization, /Aac_He_96Kbpsinit\.mp4$/);
  assert.match(audio.segmentTemplate.media, /Aac_He_96Kbps_000000001\.mp4$/);
});

test('dash parseDashManifest: dashMediaSegmentUrls lista 1..N quando ha duration/timescale', () => {
  const parsed = parseDashManifest(fixture('manifest-template.mpd'), 'https://cdn.example.com/dash/manifest.mpd');
  const video = parsed.videoRepresentations[0];
  const segs = dashMediaSegmentUrls(video.segmentTemplate, parsed.durationSeconds);
  // 308.533s / (2700000/90000 = 30s) -> 11 segmentos
  assert.equal(segs.length, 11);
  assert.match(segs[0], /_000000001\.mp4$/);
  assert.match(segs[10], /_000000011\.mp4$/);
  assert.ok(segs.every((u) => u.startsWith('https://cdn.example.com/dash/')));

  const audio = parsed.audioRepresentations[0];
  const audioSegs = dashMediaSegmentUrls(audio.segmentTemplate, parsed.durationSeconds);
  // 308.533s / (720000/24000 = 30s) -> 11 segmentos
  assert.equal(audioSegs.length, 11);
  assert.match(audioSegs[0], /Aac_He_96Kbps_000000001\.mp4$/);
});

test('dash parseDashManifest: dashMediaSegmentUrls respeita o limite', () => {
  const parsed = parseDashManifest(fixture('manifest-template.mpd'), 'https://cdn.example.com/dash/manifest.mpd');
  const video = parsed.videoRepresentations[0];
  assert.equal(dashMediaSegmentUrls(video.segmentTemplate, parsed.durationSeconds, 2).length, 2);
});

test('dash parseDashManifest: dashMediaSegmentUrls vazio sem template', () => {
  const parsed = parseDashManifest(fixture('manifest.mpd'), 'https://dash.example.com/manifest.mpd');
  const video = parsed.videoRepresentations[0];
  assert.deepEqual(dashMediaSegmentUrls(video.segmentTemplate ?? null, 100), []);
});

test('dash parseDashManifest: segmentTemplate e serializavel (sem funcoes)', () => {
  const parsed = parseDashManifest(fixture('manifest-template.mpd'), 'https://cdn.example.com/dash/manifest.mpd');
  const tpl = parsed.videoRepresentations[0].segmentTemplate;
  // Electron nao clona funcoes via IPC: o objeto precisa ser JSON puro.
  assert.deepEqual(JSON.parse(JSON.stringify(tpl)), tpl);
});
