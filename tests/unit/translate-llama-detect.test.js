/**
 * Testes de detecção e ciclo de vida do llama.cpp
 * (src/translate/llama-cpp/detect.js e server.js).
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkLlamaCpp } from '../../src/translate/llama-cpp/detect.js';
import { startServer, SERVER_START_TIMEOUT_MS } from '../../src/translate/llama-cpp/server.js';

const tmpDirs = [];
const savedEnv = { ...process.env };

afterEach(() => {
  delete process.env.LLAMA_CPP_PATH;
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function makeTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llama-detect-'));
  tmpDirs.push(dir);
  return dir;
}

test('usa LLAMA_CPP_PATH quando o arquivo existe', () => {
  const dir = makeTmpDir();
  const binPath = path.join(dir, 'llama-server');
  fs.writeFileSync(binPath, '#!/bin/sh\n');

  process.env.LLAMA_CPP_PATH = binPath;
  assert.equal(checkLlamaCpp().binPath, binPath);
  assert.equal(checkLlamaCpp().available, true);
});

test('sem binario em lugar nenhum, available e false', () => {
  // Garante que o PATH do teste nao tenha um llama-server real.
  const originalPath = process.env.PATH;
  process.env.PATH = '';
  try {
    const result = checkLlamaCpp();
    assert.equal(result.available, false);
    assert.equal(result.binPath, '');
  } finally {
    process.env.PATH = originalPath ?? savedEnv.PATH;
  }
});

test('SERVER_START_TIMEOUT_MS e um timeout finito e razoavel', () => {
  assert.equal(typeof SERVER_START_TIMEOUT_MS, 'number');
  assert.ok(SERVER_START_TIMEOUT_MS >= 30_000 && SERVER_START_TIMEOUT_MS <= 300_000);
});

test('server que nunca fica saudavel falha com timeout acionavel', async () => {
  await assert.rejects(
    startServer({
      binPath: 'no-such-binary',
      modelPath: 'no-such-model.gguf',
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
      startTimeoutMs: 250,
    }),
    /nao iniciou|llama-server/,
  );
});