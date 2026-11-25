/**
 * Testes do embedSubtitles por contêiner.
 *
 * Regressão principal: com videoPath `.mkv`, o código antigo re-encodava para
 * MP4 (`x.mkv.subbed.mp4`) e renomeava sobre o `.mkv` — resultado: arquivo com
 * extensão MKV e conteúdo MP4. `ffprobe` mostrava
 * format_name = "mov,mp4,m4a,3gp,3g2,mj2".
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { embedSubtitles } from '../../src/core/engine/runners/subtitles.js';

const SRT = '1\n00:00:00,000 --> 00:00:01,000\nOla\n\n';

const cleanups = [];

afterEach(async () => {
  while (cleanups.length) {
    try {
      await cleanups.pop()();
    } catch {
      /* best-effort */
    }
  }
});

/** Arquivo fake com tamanho > 0 (o FFmpeg fake não valida conteúdo). */
function makeVideo(dir, name) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, Buffer.alloc(2048, 1));
  return p;
}

/** Servidor HTTP local que serve o SRT (embedSubtitles usa fetch). */
async function serveSrt() {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(SRT);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  cleanups.push(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${port}/l.srt`;
}

function tmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-subs-embed-'));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** FFmpeg fake: registra os args e grava o arquivo de saída. */
function makeFfmpeg(calls) {
  return ({ args }) => {
    calls.push(args);
    const out = args[args.length - 1];
    fs.writeFileSync(out, Buffer.alloc(1024, 2));
    return { promise: Promise.resolve({ ok: true, code: 0 }) };
  };
}

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

test('MKV: soft subs (-c:v copy, -c:s srt), sem libx264 e sem .subbed.mp4', async () => {
  const dir = tmpDir();
  const videoPath = makeVideo(dir, 'v.mkv');
  const uri = await serveSrt();
  const calls = [];

  const result = await embedSubtitles({
    videoPath,
    subtitleTracks: [{ uri, language: 'pt' }],
    selectedLanguages: ['pt'],
    embedSubs: true,
    ffmpegRun: makeFfmpeg(calls),
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const args = calls[0];

  assert.equal(argValue(args, '-c:v'), 'copy', 'video deve ser copiado, sem re-encode');
  assert.equal(argValue(args, '-c:s'), 'srt', 'legenda como faixa srt');
  assert.equal(args.includes('libx264'), false, 'nao pode re-encodar');
  assert.equal(args.includes('-vf'), false, 'nao pode queimar legenda');
  assert.equal(args.some((a) => a.endsWith('.subbed.mp4')), false, 'nao pode gerar .subbed.mp4');
  assert.ok(args[args.length - 1].endsWith('.mkv'), `saida deve ser .mkv: ${args[args.length - 1]}`);
});

test('MP4: mantem hardcode com libx264 e -movflags +faststart', async () => {
  const dir = tmpDir();
  const videoPath = makeVideo(dir, 'v.mp4');
  const uri = await serveSrt();
  const calls = [];

  const result = await embedSubtitles({
    videoPath,
    subtitleTracks: [{ uri, language: 'pt' }],
    selectedLanguages: ['pt'],
    embedSubs: true,
    ffmpegRun: makeFfmpeg(calls),
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const args = calls[0];

  assert.equal(argValue(args, '-c:v'), 'libx264', 'MP4 mantem hardcode atual');
  assert.ok(args.includes('-vf'), 'MP4 usa filtro subtitles');
  assert.equal(args.includes('-movflags'), true);
  assert.equal(argValue(args, '-movflags'), '+faststart');
  assert.ok(args[args.length - 1].endsWith('.mp4'));
});

test('MKV: soft-sub que falha cai em .srt ao lado, nunca sobrescreve com mp4', async () => {
  const dir = tmpDir();
  const videoPath = makeVideo(dir, 'v.mkv');
  const uri = await serveSrt();

  const result = await embedSubtitles({
    videoPath,
    subtitleTracks: [{ uri, language: 'pt' }],
    selectedLanguages: ['pt'],
    embedSubs: true,
    ffmpegRun: () => ({ promise: Promise.resolve({ ok: false, code: 1, stderr: 'falha' }) }),
  });

  assert.equal(result.ok, true);
  const sidecar = path.join(dir, 'v.pt.srt');
  assert.ok(fs.existsSync(sidecar), 'fallback deve gravar o .srt ao lado');
  assert.equal(fs.statSync(videoPath).size, 2048, 'video original intacto');
});