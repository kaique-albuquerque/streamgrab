// Lote — escolha de áudio POR LOTE (sem mexer na configuração global).
//
// O modal do lote ganhou um seletor (off/m4a/mp3) para o usuário alternar
// entre baixar vídeo e baixar só áudio sem ir às Configurações. A escolha
// viaja no payload e sobrescreve o setting apenas naqueles jobs.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { validateBatchEnqueuePayload } from '../../electron/security-payloads-queue/batch-enqueue.js';
import { extractRunOptions } from '../../src/core/queue/pump.js';
import { processAudioExtract } from '../../src/core/engine/lifecycle/audio-extract.js';

function tmpFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-batch-audio-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, 'bytes');
  return file;
}

test('lote: payload aceita audioExtract off/m4a/mp3', () => {
  for (const value of ['off', 'm4a', 'mp3', 'MP3']) {
    const out = validateBatchEnqueuePayload({ urls: ['https://x.com/a'], audioExtract: value });
    assert.equal(out.audioExtract, value.toLowerCase());
  }
});

test('lote: audioExtract inválido é descartado (volta ao setting global)', () => {
  const out = validateBatchEnqueuePayload({ urls: ['https://x.com/a'], audioExtract: 'flac' });
  assert.equal(out.audioExtract, '');
  const semValor = validateBatchEnqueuePayload({ urls: ['https://x.com/a'] });
  assert.equal(semValor.audioExtract, '');
});

test('lote: audioExtract chega ao engine via meta do job', () => {
  assert.equal(extractRunOptions({ meta: { audioExtract: 'm4a' } }).audioExtract, 'm4a');
  assert.equal(extractRunOptions({ meta: { audioExtract: 'off' } }).audioExtract, 'off');
  assert.equal(extractRunOptions({ meta: {} }).audioExtract, null, 'sem escolha = usa o global');
});

test('lote: "off" no job vence o setting global ligado', async () => {
  const file = tmpFile('aula.mp4');
  let called = false;
  const engine = {
    settings: { get: () => 'm4a' },
    _active: new Map(),
    _emit: () => {},
  };
  await processAudioExtract(engine, { id: '1', meta: { output: file } }, {
    audioExtract: 'off',
    extract: async () => { called = true; return { audioPath: file, transcoded: false }; },
  });
  assert.equal(called, false);
  assert.equal(fs.existsSync(file), true);
});

test('lote: escolha do lote vence o setting global desligado', async () => {
  const file = tmpFile('aula.mp4');
  const audio = path.join(path.dirname(file), 'aula.m4a');
  fs.writeFileSync(audio, 'aac');
  const job = { id: '1', meta: { output: file } };
  await processAudioExtract(
    { settings: { get: () => 'off' }, _active: new Map(), _emit: () => {} },
    job,
    { audioExtract: 'm4a', extract: async () => ({ audioPath: audio, transcoded: false }) },
  );
  assert.equal(job.meta.output, audio);
  assert.equal(fs.existsSync(file), false);
});
