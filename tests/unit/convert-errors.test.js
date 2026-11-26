/**
 * Testes de erro da conversao (instanceof ConvertError).
 * Arquivo separado: mock.module de outros testes afeta a identidade do modulo.
 */
/**
 * Testes da API convertToMkv.
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { convertToMkv, ConvertError } from '../../src/convert/index.js';
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

test('arquivo inexistente: ConvertError com code', async () => {
  await assert.rejects(
    convertToMkv({ inputPath: '/nao/existe.mp4' }),
    (err) => err instanceof ConvertError && /não encontrado/i.test(err.message),
  );
});

test('extensao nao-video: ConvertError', async () => {
  const dir = tmpDir();
  const p = path.join(dir, 'a.txt');
  fs.writeFileSync(p, 'x');
  await assert.rejects(
    convertToMkv({ inputPath: p }),
    (err) => err instanceof ConvertError && /vídeo/i.test(err.message),
  );
});

test('cancelamento: sem arquivo parcial', async () => {
  const dir = tmpDir();
  const input = makeVideo(dir, 'a.mp4');
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(
    convertToMkv({
      inputPath: input,
      signal: ac.signal,
      deps: { run: () => ({ promise: Promise.resolve({ ok: false, code: -1 }) }) },
    }),
    /cancelad/i,
  );
  assert.equal(fs.existsSync(path.join(dir, 'a.mkv')), false);
});

test('ffmpeg falha: ConvertError e sem parcial', async () => {
  const dir = tmpDir();
  const input = makeVideo(dir, 'a.mp4');
  await assert.rejects(
    convertToMkv({
      inputPath: input,
      deps: { run: () => ({ promise: Promise.resolve({ ok: false, code: 1, stderr: 'incompatível' }) }) },
    }),
    ConvertError,
  );
  assert.equal(fs.existsSync(path.join(dir, 'a.mkv')), false);
});