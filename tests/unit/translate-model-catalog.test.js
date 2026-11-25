/**
 * Testes do catálogo de modelos GGUF de tradução
 * (src/translate/model-manager/catalog.js).
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import {
  DEFAULT_TRANSLATE_MODEL,
  TRANSLATE_MODEL_CATALOG,
  getTranslateModelEntry,
} from '../../src/translate/model-manager/catalog.js';
import { downloadTranslateModel, getTranslateModelStatus } from '../../src/translate/model-manager.js';

const restores = [];

afterEach(() => {
  while (restores.length) restores.pop()();
  fs.rmSync(tmpDirs.join(''), { recursive: true, force: true });
});

const tmpDirs = [];

function makeTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trmodels-'));
  tmpDirs.push(dir);
  return dir;
}

/** Catálogo pequeno para o modelo `qwen3-4b` (restore no afterEach). */
function useTinyCatalog(overrides = {}) {
  const original = { ...TRANSLATE_MODEL_CATALOG['qwen3-4b'] };
  Object.assign(
    TRANSLATE_MODEL_CATALOG['qwen3-4b'],
    { expectedSize: 64, minSize: 16, sha256: null },
    overrides,
  );
  restores.push(() => Object.assign(TRANSLATE_MODEL_CATALOG['qwen3-4b'], original));
}

/** Resposta fake com corpo streaming. */
function fakeResponse({ status = 200, bodyChunks = [], contentLength = null } = {}) {
  const body = Readable.from(bodyChunks);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => (name.toLowerCase() === 'content-length' ? (contentLength ?? '') : null),
    },
    body,
  };
}

test('default e qwen3-4b com sha256 e tamanho oficiais', () => {
  assert.equal(DEFAULT_TRANSLATE_MODEL, 'qwen3-4b');
  const info = getTranslateModelEntry('qwen3-4b');
  assert.equal(info.fileName, 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf');
  assert.equal(info.expectedSize, 2_497_281_120);
  assert.equal(info.sha256, '3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597');
});

test('modelo desconhecido nao herda de Object.prototype', () => {
  assert.equal(getTranslateModelEntry('constructor'), null);
  assert.equal(getTranslateModelEntry('__proto__'), null);
});

test('catalogo so expoe modelos com sha256 e minSize consistentes', () => {
  for (const [id, info] of Object.entries(TRANSLATE_MODEL_CATALOG)) {
    assert.ok(info.sha256?.length === 64, `${id} sem sha256`);
    assert.ok(info.minSize > 0 && info.minSize < info.expectedSize, `${id} minSize invalido`);
    assert.match(info.url, /^https:\/\/huggingface\.co\//);
  }
});

test('download grava .part, verifica hash e promove', async () => {
  const modelsDir = makeTmpDir();
  useTinyCatalog();
  const payload = Buffer.alloc(64, 3);
  const fetchImpl = async () => fakeResponse({ status: 200, bodyChunks: [payload], contentLength: payload.length });

  const status = await downloadTranslateModel({ modelsDir, model: 'qwen3-4b', fetchImpl });

  assert.equal(status.installed, true);
  assert.ok(fs.existsSync(status.path));
  assert.equal(fs.statSync(status.path).size, 64);
  assert.ok(!fs.existsSync(`${status.path}.part`), 'part nao deve sobrar');
});

test('getTranslateModelStatus reflete modelo instalado', async () => {
  const modelsDir = makeTmpDir();
  useTinyCatalog();
  const payload = Buffer.alloc(64, 3);
  const fetchImpl = async () => fakeResponse({ status: 200, bodyChunks: [payload], contentLength: payload.length });

  await downloadTranslateModel({ modelsDir, model: 'qwen3-4b', fetchImpl });
  const status = getTranslateModelStatus('qwen3-4b', { modelsDir });

  assert.equal(status.installed, true);
  assert.equal(status.model, 'qwen3-4b');
});