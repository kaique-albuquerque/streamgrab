/**
 * Testes de detecção e ciclo de vida do llama.cpp
 * (src/translate/llama-cpp/detect.js e server.js).
 */
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { startServer, SERVER_START_TIMEOUT_MS } from '../../src/translate/llama-cpp/server.js';

const tmpDirs = [];
const savedEnv = { ...process.env };

// O mock precisa vir antes de qualquer import de detect.js/paths.js.
// O detect.js importa '../../core/binaries.js' e './paths.js'; o mock resolve
// o specifier a partir deste arquivo de teste (tests/unit/ → ../../src/...).
const BINARIES_URL = pathToFileURL(new URL('../../src/core/binaries.js', import.meta.url).pathname).href;
const PATHS_URL = pathToFileURL(new URL('../../src/translate/llama-cpp/paths.js', import.meta.url).pathname).href;

mock.module(BINARIES_URL, {
  namedExports: {
    binName: (base) => (process.platform === 'win32' ? `${base}.exe` : base),
    packagedBinaryPath: () => '',
  },
});

mock.module(PATHS_URL, {
  namedExports: {
    PROJECT_ROOT: '/nonexistent',
    BIN_NAME: 'llama-server',
    VENDOR_DIR: '/nonexistent/vendor/llama',
    VENDOR_BIN: '/nonexistent/vendor/llama/llama-server',
    VENDOR_MARKER: '/nonexistent/vendor/llama/.installed',
  },
});

afterEach(() => {
  delete process.env.LLAMA_CPP_PATH;
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function makeTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llama-detect-'));
  tmpDirs.push(dir);
  return dir;
}

test('usa LLAMA_CPP_PATH quando o arquivo existe', async () => {
  const { checkLlamaCpp } = await import('../../src/translate/llama-cpp/detect.js');
  const dir = makeTmpDir();
  const binPath = path.join(dir, 'llama-server');
  fs.writeFileSync(binPath, '#!/bin/sh\n');

  process.env.LLAMA_CPP_PATH = binPath;
  assert.equal(checkLlamaCpp().binPath, binPath);
  assert.equal(checkLlamaCpp().available, true);
});

test('sem binario em lugar nenhum, available e false', async () => {
  const { checkLlamaCpp } = await import('../../src/translate/llama-cpp/detect.js');
  // O mock de binaries.js/paths.js acima força ausência de binário
  // empacotado e vendorizado; PATH vazio garante ausência no PATH.
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
