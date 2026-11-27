// Runner DASH segmentado (src/core/engine/runners/dash-segments.js).
//
// Cobre a montagem do arquivo final a partir do init + media segment:
//  - init + media (sem audio) -> remux com FFmpeg (nunca copyFile cru, que
//    gerava um MP4 so com ftyp/moov e sem frames — arquivo "corrompido");
//  - init + media + audio -> mux das tres trilhas;
//  - init ausente -> copyFile do media (compat).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { runDashSegmentedDownload } from '../../src/core/engine/runners/dash-segments.js';

function makeTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fakePrepared(dir, { init = true, audio = false } = {}) {
  const video = path.join(dir, 'video.mp4');
  const audioPath = audio ? path.join(dir, 'audio.mp4') : '';
  fs.writeFileSync(video, 'media-data');
  if (audio) fs.writeFileSync(audioPath, 'audio-media-data');
  return {
    ok: true,
    mode: audio ? 'mux' : 'single',
    videoPath: video,
    audioPath,
    initPath: init ? path.join(dir, 'init.mp4') : '',
    audioInitPath: audio && init ? path.join(dir, 'audio-init.mp4') : '',
    cleanup: () => {},
  };
}

test('dash runner: init+media sem audio chama ffmpegStartDownload (nao copyFile)', async () => {
  const dir = makeTmp('sg-dash-runner-single-');
  const out = path.join(dir, 'out.mp4');
  const calls = { download: [], mux: [] };
  try {
    const prepared = fakePrepared(dir);
    fs.writeFileSync(prepared.initPath, 'init-data');

    const result = await runDashSegmentedDownload(
      'https://cdn/manifest.mpd', out, {}, new AbortController().signal, () => {},
      {
        prepareDashSegments: async () => prepared,
        ffmpegStartDownload: ({ url, output }) => {
          calls.download.push({ url, output });
          fs.writeFileSync(output, 'remuxed');
          return { promise: Promise.resolve({ ok: true }), stop: () => {} };
        },
        ffmpegStartMuxDownload: () => {
          calls.mux.push('mux');
          return { promise: Promise.resolve({ ok: true }), stop: () => {} };
        },
      },
    );

    assert.equal(result.ok, true);
    assert.equal(calls.mux.length, 0, 'sem audio nao deve usar mux');
    assert.equal(calls.download.length, 1, 'deve usar ffmpegStartDownload para remux init+media');
    assert.equal(calls.download[0].output, out);
    assert.ok(calls.download[0].url.endsWith('.video.mp4'), 'remux usa init+media concatenados');
    assert.ok(fs.existsSync(out), 'saida deve existir');
    assert.notEqual(fs.readFileSync(out, 'utf8'), 'media-data', 'saida nao pode ser copia crua do media');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dash runner: init+media+audio usa mux com os tres inputs', async () => {
  const dir = makeTmp('sg-dash-runner-mux-');
  const out = path.join(dir, 'out.mp4');
  const calls = [];
  try {
    const prepared = fakePrepared(dir, { audio: true });
    fs.writeFileSync(prepared.initPath, 'init-data');
    fs.writeFileSync(prepared.audioInitPath, 'audio-init-data');

    const result = await runDashSegmentedDownload(
      'https://cdn/manifest.mpd', out, {}, new AbortController().signal, () => {},
      {
        prepareDashSegments: async () => prepared,
        ffmpegStartDownload: () => { calls.push('download'); return { promise: Promise.resolve({ ok: true }), stop: () => {} }; },
        ffmpegStartMuxDownload: ({ videoInput, audioInput, output }) => {
          calls.push({ videoInput, audioInput, output });
          fs.writeFileSync(output, 'muxed');
          return { promise: Promise.resolve({ ok: true }), stop: () => {} };
        },
      },
    );

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    // init+media concatenados antes do mux (o media cru nao tem moov).
    assert.ok(calls[0].videoInput.endsWith('.video.mp4'), 'videoInput e init+media concatenados');
    assert.ok(calls[0].audioInput.endsWith('.audio.mp4'), 'audioInput e init+media concatenados');
    assert.notEqual(calls[0].videoInput, prepared.videoPath);
    assert.equal(calls[0].output, out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dash runner: sem init reempacota o media (compat)', async () => {
  const dir = makeTmp('sg-dash-runner-legacy-');
  const out = path.join(dir, 'out.mp4');
  let muxCalls = 0;
  try {
    const prepared = fakePrepared(dir, { init: false });

    const result = await runDashSegmentedDownload(
      'https://cdn/manifest.mpd', out, {}, new AbortController().signal, () => {},
      {
        prepareDashSegments: async () => prepared,
        ffmpegStartDownload: ({ output }) => {
          fs.writeFileSync(output, 'remuxed');
          return { promise: Promise.resolve({ ok: true }), stop: () => {} };
        },
        ffmpegStartMuxDownload: () => { muxCalls++; return { promise: Promise.resolve({ ok: true }), stop: () => {} }; },
      },
    );

    assert.equal(result.ok, true);
    assert.equal(muxCalls, 0);
    assert.equal(fs.readFileSync(out, 'utf8'), 'remuxed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dash runner: falha do remux propaga erro', async () => {
  const dir = makeTmp('sg-dash-runner-fail-');
  const out = path.join(dir, 'out.mp4');
  try {
    const prepared = fakePrepared(dir);
    fs.writeFileSync(prepared.initPath, 'init-data');

    const result = await runDashSegmentedDownload(
      'https://cdn/manifest.mpd', out, {}, new AbortController().signal, () => {},
      {
        prepareDashSegments: async () => prepared,
        ffmpegStartDownload: () => ({ promise: Promise.resolve({ ok: false, code: 1, stderr: 'boom' }), stop: () => {} }),
        ffmpegStartMuxDownload: () => ({ promise: Promise.resolve({ ok: true }), stop: () => {} }),
      },
    );

    assert.equal(result.ok, false);
    assert.equal(result.code, 'REMUX_FAILED');
    assert.match(result.error, /boom/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});