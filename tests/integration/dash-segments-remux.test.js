// Integration: DASH segmentado (init + media) com FFmpeg real.
//
// Repro do bug: o backend baixava init e media como arquivos separados e, sem
// audio, entregava o init cru (ftyp/moov, sem frames) -> MP4 "corrompido".
// Gera um DASH real com FFmpeg, serve via HTTP local e valida que a saida do
// runner tem frames de video (duration > 0). Sem rede externa.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { checkFfmpeg, getFfmpegCommand } from '../../src/ffmpeg.js';
import { runDashSegmentedDownload } from '../../src/core/engine/runners/dash-segments.js';

const HAS_FFMPEG = await checkFfmpeg();

function ffmpeg(args, opts = {}) {
  return spawnSync(getFfmpegCommand(), args, { windowsHide: true, encoding: 'utf8', ...opts });
}

function startServer(rootDir) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(rootDir, urlPath);
    if (!file.startsWith(rootDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const data = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Length': data.length });
    res.end(data);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function stopServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('dash runner: init + media (sem audio) gera MP4 com frames', { skip: !HAS_FFMPEG }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-it-dash-seg-'));
  const gen = ffmpeg([
    '-y', '-f', 'lavfi', '-i', 'testsrc=duration=3:size=160x120:rate=10',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '10',
    '-f', 'dash', '-seg_duration', '1', '-window_size', '0',
    '-init_seg_name', 'init-$RepresentationID$.mp4',
    '-media_seg_name', 'seg-$RepresentationID$-$Number$.m4s',
    'manifest.mpd',
  ], { cwd: dir });
  assert.equal(gen.status, 0, `geracao do DASH falhou: ${gen.stderr}`);

  const { server, port } = await startServer(dir);
  try {
    const output = path.join(dir, 'out.mp4');
    const result = await runDashSegmentedDownload(
      `http://127.0.0.1:${port}/manifest.mpd`, output, {}, new AbortController().signal, () => {},
      {
        prepareDashSegments: async () => ({
          ok: true,
          mode: 'single',
          videoPath: path.join(dir, 'seg-0-1.m4s'),
          audioPath: '',
          initPath: path.join(dir, 'init-0.mp4'),
          cleanup: () => {},
        }),
      },
    );
    assert.equal(result.ok, true, `runDashSegmentedDownload falhou: ${result.error || ''}`);
    assert.ok(fs.existsSync(output) && fs.statSync(output).size > 0, 'MP4 de saida deve existir');

    // A saida precisa ter video decodificavel (nao apenas ftyp/moov).
    const probe = ffmpeg(['-v', 'error', '-i', output, '-f', 'null', '-']);
    assert.equal(probe.status, 0, `MP4 de saida nao decodifica: ${probe.stderr}`);
    const info = ffmpeg(['-i', output]);
    assert.match(info.stderr, /Duration: 00:00:0[1-9]/, `duracao deve ser > 0: ${info.stderr.slice(0, 300)}`);
  } finally {
    await stopServer(server);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});