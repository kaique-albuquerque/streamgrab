/**
 * Testes de detecção do whisper.cpp (src/transcribe/whisper-cpp.js).
 * Usa WHISPER_CPP_PATH apontando para arquivos temporários — sem binário real.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkWhisperCpp } from '../../src/transcribe/whisper-cpp.js';

const ENV_KEYS = ['WHISPER_CPP_PATH', 'WHISPER_MODEL_DIR', 'WHISPER_MODEL_PATH'];
let savedEnv = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

test('checkWhisperCpp: WHISPER_CPP_PATH definido e existente → disponível', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-whisper-'));
  try {
    const binPath = path.join(tmp, 'whisper-cli.exe');
    fs.writeFileSync(binPath, 'fake');

    process.env.WHISPER_CPP_PATH = binPath;
    const result = checkWhisperCpp();

    assert.equal(result.available, true);
    assert.equal(result.binPath, binPath);
    // modelsDir padrão: irmão do binário (dirname/models)
    assert.equal(result.modelsDir, path.join(tmp, 'models'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('checkWhisperCpp: WHISPER_MODEL_DIR tem prioridade no modelsDir', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-whisper-'));
  try {
    const binPath = path.join(tmp, 'whisper-cli.exe');
    fs.writeFileSync(binPath, 'fake');
    const customModels = path.join(tmp, 'modelos-custom');

    process.env.WHISPER_CPP_PATH = binPath;
    process.env.WHISPER_MODEL_DIR = customModels;
    const result = checkWhisperCpp();

    assert.equal(result.available, true);
    assert.equal(result.modelsDir, customModels);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('checkWhisperCpp: WHISPER_CPP_PATH apontando para arquivo inexistente cai no PATH', () => {
  process.env.WHISPER_CPP_PATH = path.join(os.tmpdir(), 'nao-existe-whisper.exe');
  const result = checkWhisperCpp();
  // Não deve escolher o binário inexistente do env
  assert.notEqual(result.binPath, process.env.WHISPER_CPP_PATH);
});
