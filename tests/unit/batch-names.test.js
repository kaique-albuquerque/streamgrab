// Lote/engine — nomes de saída únicos e nomes escolhidos pelo usuário.
//
// Regressões cobertas:
//  1. jobs que começam juntos recebiam o MESMO caminho de saída (o lote
//     terminava com um único arquivo);
//  2. o nome forçado ".mp4" gerava "video.mp4.ts" e, com extração de áudio,
//     "video.mp4.m4a";
//  3. não havia como renomear cada arquivo do lote.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { buildFilename, processBatch } from '../../src/batch.js';
import { resolveOutput } from '../../src/core/engine/lifecycle/output.js';
import { stripForeignExtension } from '../../src/core/engine/lifecycle/extension.js';
import { suggestName } from '../../electron/renderer/batch-dialog/names.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sg-batch-name-'));
}

function fakeEngine(dir) {
  return { settings: { get: () => dir }, _reservedOutputs: new Set() };
}

test('nomes: buildFilename devolve apenas a base, sem extensão', () => {
  assert.equal(buildFilename({ title: 'Aula 01', url: 'https://x.com/a.ts' }), 'Aula 01');
  assert.equal(buildFilename({ title: 'aula.mp4', url: 'https://x.com/a.ts' }), 'aula');
  assert.equal(buildFilename({ title: '', url: 'https://x.com/video.ts' }), 'video');
});

test('nomes: fallback é distinto por item (video-1, video-2)', () => {
  assert.equal(buildFilename({ title: '', url: 'https://x.com/', index: 0 }), 'video-1');
  assert.equal(buildFilename({ title: '', url: 'https://x.com/', index: 1 }), 'video-2');
});

test('nomes: stripForeignExtension remove extensão de container diferente', () => {
  assert.equal(stripForeignExtension('video.mp4', '.ts'), 'video');
  assert.equal(stripForeignExtension('video.mp4', '.mp4'), 'video.mp4');
  assert.equal(stripForeignExtension('Aula 2.10', '.mp4'), 'Aula 2.10');
  assert.equal(stripForeignExtension('sem-extensao', '.ts'), 'sem-extensao');
});

test('nomes: jobs simultâneos recebem caminhos diferentes (mesmo sem arquivo no disco)', () => {
  const dir = tempDir();
  const engine = fakeEngine(dir);
  const prepared = { downloadUrl: 'https://x.com/video' };

  const first = resolveOutput(engine, { meta: { filename: 'video' } }, prepared, dir);
  const second = resolveOutput(engine, { meta: { filename: 'video' } }, prepared, dir);
  const third = resolveOutput(engine, { meta: { filename: 'video' } }, prepared, dir);

  assert.notEqual(first, second);
  assert.notEqual(second, third);
  assert.equal(path.basename(second), 'video (1).mp4');
  assert.equal(path.basename(third), 'video (2).mp4');
  assert.equal(engine._reservedOutputs.size, 3);
});

test('nomes: reserva é liberada e o caminho pode ser reutilizado depois', () => {
  const dir = tempDir();
  const engine = fakeEngine(dir);
  const prepared = { downloadUrl: 'https://x.com/video' };

  const first = resolveOutput(engine, { meta: { filename: 'video' } }, prepared, dir);
  engine._reservedOutputs.delete(first);

  assert.equal(resolveOutput(engine, { meta: { filename: 'video' } }, prepared, dir), first);
});

test('nomes: suggestName da UI usa o último segmento e remove a extensão', () => {
  assert.equal(suggestName('https://x.com/aulas/aula01.ts', 0), 'aula01');
  assert.equal(suggestName('https://x.com/video', 2), 'video');
  assert.equal(suggestName('https://x.com/', 0), 'video-1');
  assert.equal(suggestName('nao-e-url', 1), 'video-2');
});

test('lote: nomes escolhidos pelo usuário são usados no enfileiramento', async () => {
  const captured = [];
  await processBatch({
    urls: ['https://x.com/1', 'https://x.com/2', 'https://x.com/3'],
    names: ['Aula 01', '', 'Aula 03'],
    analyze: async () => null,
    enqueue: async (item) => {
      captured.push(item.filename);
      return { id: `job-${captured.length}` };
    },
  });
  assert.deepEqual(captured, ['Aula 01', '2', 'Aula 03']);
});

test('lote: nome com extensão é reduzido à base (sem ".mp4.m4a")', async () => {
  const captured = [];
  await processBatch({
    urls: ['https://x.com/aula.ts'],
    names: ['Aula 01.mp4'],
    analyze: async () => null,
    enqueue: async (item) => {
      captured.push(item.filename);
      return { id: 'job-1' };
    },
  });
  assert.deepEqual(captured, ['Aula 01']);
});
