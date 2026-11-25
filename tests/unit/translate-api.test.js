/**
 * Testes da API pública de tradução (src/translate/index.js).
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { translateSubtitle } from '../../src/translate/index.js';

const tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function makeTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-'));
  tmpDirs.push(dir);
  return dir;
}

/** Servidor fake: devolve baseUrl/apiKey e um stop() inofensivo. */
function fakeServer() {
  return Promise.resolve({ baseUrl: 'http://127.0.0.1:1', apiKey: 'k', stop: () => Promise.resolve() });
}

/** Status de modelo fake: sempre instalado. */
function fakeInstalledStatus() {
  return { installed: true, label: 'Qwen3-4B', path: '/fake/model.gguf' };
}

/** Disponibilidade fake: binário presente. */
function fakeAvailable() {
  return { available: true, binPath: '/fake/llama-server' };
}

test('translateSubtitle escreve .pt.srt ao lado e preserva tempos', async () => {
  const dir = makeTmpDir();
  const srtPath = path.join(dir, 'v.transcription.srt');
  fs.writeFileSync(srtPath, '1\n00:00:00,000 --> 00:00:02,000\nHello\n', 'utf8');

  const result = await translateSubtitle({
    srtPath,
    deps: {
      startServer: fakeServer,
      chat: async () => ({ 1: 'Ola' }),
      getTranslateModelStatus: fakeInstalledStatus,
      checkLlamaCpp: fakeAvailable,
    },
  });

  assert.equal(result.outputPath, path.join(dir, 'v.transcription.pt.srt'));
  const out = fs.readFileSync(result.outputPath, 'utf8');
  assert.match(out, /-->/);
  assert.match(out, /Ola/);
  assert.doesNotMatch(out, /Hello/);
  assert.equal(result.segments, 1);
});

test('erro no bloco 2 nao deixa .pt.srt parcial', async () => {
  const dir = makeTmpDir();
  const srtPath = path.join(dir, 'v.transcription.srt');
  const cues = Array.from({ length: 35 }, (_, i) => `${i + 1}\n00:00:0${i % 10},000 --> 00:00:0${i % 10},500\nHello ${i}`).join('\n\n');
  fs.writeFileSync(srtPath, `${cues}\n`, 'utf8');

  let calls = 0;
  const chat = async () => {
    calls++;
    if (calls === 2) throw new Error('boom');
    return { 1: 'ok' };
  };

  await assert.rejects(
    translateSubtitle({
      srtPath,
      deps: {
        startServer: fakeServer,
        chat,
        getTranslateModelStatus: fakeInstalledStatus,
        checkLlamaCpp: fakeAvailable,
      },
    }),
  );
  assert.equal(fs.existsSync(path.join(dir, 'v.transcription.pt.srt')), false);
});

test('recusa arquivo que nao termina em .srt', async () => {
  const dir = makeTmpDir();
  const srtPath = path.join(dir, 'v.txt');
  fs.writeFileSync(srtPath, 'x', 'utf8');
  await assert.rejects(
    translateSubtitle({
      srtPath,
      deps: {
        startServer: fakeServer,
        chat: async () => ({}),
        getTranslateModelStatus: fakeInstalledStatus,
        checkLlamaCpp: fakeAvailable,
      },
    }),
    /\.srt/,
  );
});