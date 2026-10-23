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

import {
  getModelStatus,
  getModelStatusFor,
  getModelsDir,
  listModels,
  listModelsFor,
  listModelIds,
  isKnownModel,
  modelSearchDirs,
  setModelsDirResolver,
  downloadModel,
  deleteModel,
  MODEL_CATALOG,
} from '../../src/transcribe/model-manager.js';
import { createHash } from 'node:crypto';

const INFO = MODEL_CATALOG.small;

/**
 * Reduz o tamanho esperado de um modelo do catálogo para payloads pequenos
 * (testes sem centenas de MB em memória). Retorna a função de restore.
 */
function shrinkModel(model, overrides = {}) {
  const original = { ...MODEL_CATALOG[model] };
  // Os payloads de teste não têm o hash do modelo real: desliga a verificação
  // SHA-256 (os testes de integridade passam o hash esperado explicitamente).
  Object.assign(MODEL_CATALOG[model], { expectedSize: 1000, minSize: 100, sha256: null }, overrides);
  return () => Object.assign(MODEL_CATALOG[model], original);
}

/** Atalho: catálogo pequeno para o modelo `small`. */
function useTinyCatalog(overrides = {}) {
  return shrinkModel('small', overrides);
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

test('downloadModel: grava marcador quando o SHA-256 confere', async () => {
  const dir = makeTmpDir();
  const payload = Buffer.alloc(1024, 9);
  const digest = createHash('sha256').update(payload).digest('hex');
  const restore = useTinyCatalog({ sha256: digest });
  try {
    const fetchImpl = async () => fakeResponse({ status: 200, bodyChunks: [payload], contentLength: payload.length });
    const status = await downloadModel({ modelsDir: dir, model: 'small', fetchImpl });

    assert.equal(status.installed, true);
    assert.equal(status.hashVerified, true, 'hashVerified só após marcador de integridade');
    assert.ok(fs.existsSync(`${status.path}.sha256`));
  } finally {
    restore();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('downloadModel: SHA-256 divergente descarta o arquivo corrompido', async () => {
  const dir = makeTmpDir();
  const restore = useTinyCatalog({ sha256: 'a'.repeat(64) });
  try {
    const payload = Buffer.alloc(1024, 4);
    const fetchImpl = async () => fakeResponse({ status: 200, bodyChunks: [payload], contentLength: payload.length });

    await assert.rejects(downloadModel({ modelsDir: dir, model: 'small', fetchImpl }), /corrompido/);
    assert.equal(fs.existsSync(path.join(dir, `${INFO.fileName}.part`)), false, 'arquivo corrompido é descartado');
  } finally {
    restore();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('listModels: devolve o catálogo inteiro, na ordem de exibição', () => {
  const dir = makeTmpDir();
  try {
    const list = listModels(dir);
    assert.deepEqual(list.map((m) => m.model), listModelIds());
    assert.deepEqual(list.map((m) => m.model), ['tiny', 'base', 'small', 'medium', 'large-v3']);
    assert.ok(list.every((m) => m.installed === false && m.size === 0));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('listModels: reflete modelo instalado e progresso parcial', () => {
  const dir = makeTmpDir();
  const restoreTiny = shrinkModel('tiny');
  const restoreBase = shrinkModel('base', { expectedSize: 10000, minSize: 100 });
  try {
    fs.writeFileSync(path.join(dir, MODEL_CATALOG.tiny.fileName), Buffer.alloc(1000));
    fs.writeFileSync(`${path.join(dir, MODEL_CATALOG.base.fileName)}.part`, Buffer.alloc(1000));

    const list = new Map(listModels(dir).map((m) => [m.model, m]));
    assert.equal(list.get('tiny').installed, true);
    assert.equal(list.get('tiny').percent, 100);
    assert.equal(list.get('base').installed, false);
    assert.equal(list.get('base').partialSize, 1000);
    assert.equal(list.get('base').percent, 10);
  } finally {
    restoreBase();
    restoreTiny();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('deleteModel: remove modelo, .part e marcador de hash', () => {
  const dir = makeTmpDir();
  try {
    const modelPath = path.join(dir, MODEL_CATALOG.medium.fileName);
    fs.writeFileSync(modelPath, Buffer.alloc(2048));
    fs.writeFileSync(`${modelPath}.part`, Buffer.alloc(16));
    fs.writeFileSync(`${modelPath}.sha256`, '{}');

    const result = deleteModel(dir, 'medium');

    assert.equal(result.model, 'medium');
    assert.equal(result.removed.length, 3);
    for (const file of result.removed) assert.equal(fs.existsSync(file), false);
    assert.equal(result.status.installed, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('deleteModel: id desconhecido lança erro', () => {
  const dir = makeTmpDir();
  try {
    assert.throws(() => deleteModel(dir, 'huge'), /desconhecido/);
    assert.throws(() => deleteModel(dir, 'constructor'), /desconhecido/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('isKnownModel: não resolve propriedades herdadas de Object.prototype', () => {
  assert.equal(isKnownModel('small'), true);
  assert.equal(isKnownModel('constructor'), false);
  assert.equal(isKnownModel('__proto__'), false);
  assert.equal(isKnownModel('toString'), false);
  assert.equal(isKnownModel(''), false);
  assert.equal(isKnownModel(null), false);
});

/**
 * Registra um diretório gravável temporário e restaura o estado global depois.
 * Também neutraliza WHISPER_MODEL_DIR para o teste controlar a ordem de busca.
 */
function withModelsDir(dir, fn) {
  const previousEnv = process.env.WHISPER_MODEL_DIR;
  delete process.env.WHISPER_MODEL_DIR;
  setModelsDirResolver(dir ? () => dir : null);
  try {
    return fn();
  } finally {
    setModelsDirResolver(null);
    if (previousEnv === undefined) delete process.env.WHISPER_MODEL_DIR;
    else process.env.WHISPER_MODEL_DIR = previousEnv;
  }
}

test('modelSearchDirs: ordem gravável → motor, com dedup e sem entradas vazias', () => {
  const appDir = makeTmpDir();
  const engineDir = makeTmpDir();

  withModelsDir(appDir, () => {
    assert.deepEqual(modelSearchDirs(engineDir), [appDir, engineDir]);
    // Diretório do motor ausente ou igual ao do app não duplica entradas.
    assert.deepEqual(modelSearchDirs(''), [appDir]);
    assert.deepEqual(modelSearchDirs(appDir), [appDir]);
    assert.equal(getModelsDir(), appDir);
  });

  // Sem resolver registrado, só resta o diretório do motor.
  assert.deepEqual(modelSearchDirs(engineDir), [engineDir]);

  fs.rmSync(appDir, { recursive: true, force: true });
  fs.rmSync(engineDir, { recursive: true, force: true });
});

test('getModelStatus: modelo só no diretório do motor conta como instalado', () => {
  const restore = useTinyCatalog();
  const appDir = makeTmpDir();
  const engineDir = makeTmpDir();

  try {
    const external = path.join(engineDir, INFO.fileName);
    fs.writeFileSync(external, Buffer.alloc(1000));

    const status = getModelStatus(appDir, 'small', { extraDirs: [engineDir] });

    assert.equal(status.installed, true, 'não deve pedir novo download de 465 MB');
    assert.equal(status.path, external);
    assert.equal(status.dir, engineDir);
    assert.equal(status.externalDir, engineDir);
  } finally {
    restore();
    fs.rmSync(appDir, { recursive: true, force: true });
    fs.rmSync(engineDir, { recursive: true, force: true });
  }
});

test('getModelStatus: arquivo externo incompleto não conta como instalado', () => {
  const restore = useTinyCatalog();
  const appDir = makeTmpDir();
  const engineDir = makeTmpDir();

  try {
    fs.writeFileSync(path.join(engineDir, INFO.fileName), Buffer.alloc(99));

    const status = getModelStatus(appDir, 'small', { extraDirs: [engineDir] });

    assert.equal(status.installed, false);
    assert.equal(status.externalDir, '');
    assert.equal(status.path, path.join(appDir, INFO.fileName));
  } finally {
    restore();
    fs.rmSync(appDir, { recursive: true, force: true });
    fs.rmSync(engineDir, { recursive: true, force: true });
  }
});

test('getModelStatus: o diretório gravável tem prioridade sobre o do motor', () => {
  const restore = useTinyCatalog();
  const appDir = makeTmpDir();
  const engineDir = makeTmpDir();

  try {
    fs.writeFileSync(path.join(appDir, INFO.fileName), Buffer.alloc(1000));
    fs.writeFileSync(path.join(engineDir, INFO.fileName), Buffer.alloc(1000));

    const status = getModelStatus(appDir, 'small', { extraDirs: [engineDir] });

    assert.equal(status.installed, true);
    assert.equal(status.dir, appDir);
    assert.equal(status.externalDir, '');
  } finally {
    restore();
    fs.rmSync(appDir, { recursive: true, force: true });
    fs.rmSync(engineDir, { recursive: true, force: true });
  }
});

test('getModelStatusFor/listModelsFor: usam resolver como gravável e o motor como fallback', () => {
  const restore = useTinyCatalog();
  const appDir = makeTmpDir();
  const engineDir = makeTmpDir();

  try {
    fs.writeFileSync(path.join(engineDir, INFO.fileName), Buffer.alloc(1000));

    withModelsDir(appDir, () => {
      const status = getModelStatusFor('small', engineDir);
      assert.equal(status.installed, true);
      assert.equal(status.externalDir, engineDir);

      const listed = listModelsFor(engineDir);
      assert.equal(listed.length, listModelIds().length);
      assert.equal(listed.find((item) => item.model === 'small').installed, true);
      assert.equal(listed.find((item) => item.model === 'tiny').installed, false);
    });
  } finally {
    restore();
    fs.rmSync(appDir, { recursive: true, force: true });
    fs.rmSync(engineDir, { recursive: true, force: true });
  }
});

test('deleteModel: não toca em modelo instalado fora do diretório gravável', () => {
  const restore = useTinyCatalog();
  const appDir = makeTmpDir();
  const engineDir = makeTmpDir();

  try {
    const external = path.join(engineDir, INFO.fileName);
    fs.writeFileSync(external, Buffer.alloc(1000));

    const result = deleteModel(appDir, 'small');

    assert.deepEqual(result.removed, []);
    assert.equal(fs.existsSync(external), true);
  } finally {
    restore();
    fs.rmSync(appDir, { recursive: true, force: true });
    fs.rmSync(engineDir, { recursive: true, force: true });
  }
});
