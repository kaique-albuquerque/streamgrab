/**
 * Testes do model-manager (src/transcribe/model-manager.js).
 * Downloads simulados via fetch injetável — sem rede real.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { getModelStatus, downloadModel, MODEL_CATALOG } from '../../src/transcribe/model-manager.js';

const INFO = MODEL_CATALOG.small;

/**
 * Ajusta o catálogo para payloads pequenos — testes sem 244 MB em memória.
 * Retorna a função de restore.
 */
function useTinyCatalog(overrides = {}) {
  const original = { ...MODEL_CATALOG.small };
  Object.assign(MODEL_CATALOG.small, { expectedSize: 1000, minSize: 100 }, overrides);
  return () => Object.assign(MODEL_CATALOG.small, original);
}

/** Cria uma resposta fake com corpo streaming. */
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

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sg-model-'));
}

test('getModelStatus: não instalado quando o diretório está vazio', () => {
  const dir = makeTmpDir();
  try {
    const status = getModelStatus(dir, 'small');
    assert.equal(status.installed, false);
    assert.equal(status.size, 0);
    assert.equal(status.percent, 0);
    assert.ok(status.path.endsWith(INFO.fileName));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('getModelStatus: modelo desconhecido retorna error', () => {
  const status = getModelStatus('/tmp', 'huge');
  assert.equal(status.installed, false);
  assert.match(status.error, /desconhecido/);
});

test('getModelStatus: arquivo completo (>= 90%) marca installed', () => {
  const dir = makeTmpDir();
  try {
    fs.writeFileSync(path.join(dir, INFO.fileName), Buffer.alloc(Math.floor(INFO.expectedSize * 0.95)));
    const status = getModelStatus(dir, 'small');
    assert.equal(status.installed, true);
    assert.equal(status.percent, 100);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('downloadModel: download completo cria o modelo e reporta progresso', async () => {
  const dir = makeTmpDir();
  const restore = useTinyCatalog();
  try {
    const payload = Buffer.alloc(1024, 7);
    const events = [];
    const fetchImpl = async () => fakeResponse({ status: 200, bodyChunks: [payload], contentLength: payload.length });

    const status = await downloadModel({ modelsDir: dir, model: 'small', fetchImpl, onProgress: (e) => events.push(e) });

    assert.equal(status.installed, true);
    assert.ok(fs.existsSync(status.path));
    assert.equal(fs.statSync(status.path).size, payload.length);
    assert.ok(!fs.existsSync(`${status.path}.part`), 'part não deve sobrar');
    assert.ok(events.some((e) => e.stage === 'downloading'));
    assert.equal(events.at(-1).stage, 'done');
  } finally {
    restore();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('downloadModel: já instalado não faz download', async () => {
  const dir = makeTmpDir();
  try {
    fs.writeFileSync(path.join(dir, INFO.fileName), Buffer.alloc(Math.floor(INFO.expectedSize * 0.95)));
    let called = false;
    const fetchImpl = async () => {
      called = true;
      return fakeResponse();
    };
    const status = await downloadModel({ modelsDir: dir, fetchImpl });
    assert.equal(status.installed, true);
    assert.equal(called, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('downloadModel: retoma download parcial via HTTP Range (206)', async () => {
  const dir = makeTmpDir();
  // minSize=800: .part (500) ainda é parcial → download com Range;
  // final (1000) atende o mínimo.
  const restore = useTinyCatalog({ minSize: 800 });
  try {
    // .part com metade do payload
    const payload = Buffer.alloc(1000, 3);
    const half = payload.subarray(0, 500);
    fs.writeFileSync(path.join(dir, `${INFO.fileName}.part`), half);

    let rangeHeader = null;
    const fetchImpl = async (_url, opts = {}) => {
      rangeHeader = opts.headers?.Range || null;
      return fakeResponse({ status: 206, bodyChunks: [payload.subarray(500)], contentLength: 500 });
    };

    const status = await downloadModel({ modelsDir: dir, fetchImpl });

    assert.equal(rangeHeader, 'bytes=500-');
    assert.equal(status.installed, true);
    assert.equal(fs.statSync(status.path).size, 1000);
  } finally {
    restore();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('downloadModel: servidor ignorou Range (200) recomeça do zero', async () => {
  const dir = makeTmpDir();
  // minSize=800: .part (500) é parcial → tenta Range; servidor responde 200.
  const restore = useTinyCatalog({ minSize: 800 });
  try {
    fs.writeFileSync(path.join(dir, `${INFO.fileName}.part`), Buffer.alloc(500, 1));
    const payload = Buffer.alloc(1000, 2);

    let rangeHeader = null;
    const fetchImpl = async (_url, opts = {}) => {
      rangeHeader = opts.headers?.Range || null;
      return fakeResponse({ status: 200, bodyChunks: [payload], contentLength: 1000 });
    };

    const status = await downloadModel({ modelsDir: dir, fetchImpl });

    assert.equal(rangeHeader, 'bytes=500-');
    assert.equal(status.installed, true);
    assert.equal(fs.statSync(status.path).size, 1000, 'arquivo deve ser reescrito por completo');
  } finally {
    restore();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('downloadModel: HTTP 404 lança erro claro', async () => {
  const dir = makeTmpDir();
  try {
    const fetchImpl = async () => fakeResponse({ status: 404 });
    await assert.rejects(
      downloadModel({ modelsDir: dir, fetchImpl }),
      /HTTP 404/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('downloadModel: arquivo incompleto lança erro de integridade', async () => {
  const dir = makeTmpDir();
  // minSize maior que o corpo baixado (100 bytes) → deve rejeitar
  const restore = useTinyCatalog({ minSize: 500 });
  try {
    const tiny = Buffer.alloc(100, 5);
    const fetchImpl = async () => fakeResponse({ status: 200, bodyChunks: [tiny], contentLength: tiny.length });
    await assert.rejects(
      downloadModel({ modelsDir: dir, fetchImpl }),
      /incompleto/
    );
    // .part preservado para retomada
    assert.ok(fs.existsSync(path.join(dir, `${INFO.fileName}.part`)));
  } finally {
    restore();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
