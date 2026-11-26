/**
 * Testes da API convertToMkv.
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { convertToMkv } from '../../src/convert/index.js';

const cleanups = [];

afterEach(() => {
  while (cleanups.length) {
    try {
      cleanups.pop()();
    } catch {
      /* best-effort */
    }
  }
});

function tmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-convert-'));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Cria um arquivo de vídeo fake (o FFmpeg fake não valida conteúdo). */
function makeVideo(dir, name) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, Buffer.alloc(2048, 1));
  return p;
}

/** FFmpeg fake: grava o output e devolve ok. */
function okRun({ args }) {
  const out = args[args.length - 1];
  fs.writeFileSync(out, Buffer.alloc(4096, 2));
  return { promise: Promise.resolve({ ok: true, code: 0 }) };
}

test('entrada .mkv: alreadyMkv true e nao chama ffmpeg', async () => {
  const dir = tmpDir();
  const input = makeVideo(dir, 'a.mkv');
  let called = false;
  const r = await convertToMkv({
    inputPath: input,
    deps: { run: () => { called = true; return { promise: Promise.resolve({ ok: true }) }; } },
  });
  assert.equal(r.alreadyMkv, true);
  assert.equal(called, false);
  assert.equal(r.outputPath, input);
});

test('entrada .mp4: gera .mkv ao lado', async () => {
  const dir = tmpDir();
  const input = makeVideo(dir, 'a.mp4');
  const r = await convertToMkv({ inputPath: input, deps: { run: okRun } });
  assert.equal(r.alreadyMkv, false);
  assert.equal(r.outputPath, path.join(dir, 'a.mkv'));
  assert.ok(fs.existsSync(r.outputPath));
  assert.ok(r.size > 0);
});

test('destino existente: gera (1).mkv', async () => {
  const dir = tmpDir();
  const input = makeVideo(dir, 'a.mp4');
  makeVideo(dir, 'a.mkv'); // ja existe
  const r = await convertToMkv({ inputPath: input, deps: { run: okRun } });
  assert.equal(r.outputPath, path.join(dir, 'a (1).mkv'));
});
