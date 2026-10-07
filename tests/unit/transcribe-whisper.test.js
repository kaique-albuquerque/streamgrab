/**
 * Testes de detecção do whisper.cpp (src/transcribe/whisper-cpp.js).
 * Usa WHISPER_CPP_PATH apontando para arquivos temporários — sem binário real.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkWhisperCpp, transcribeWithCpp } from '../../src/transcribe/whisper-cpp.js';
import { MODEL_CATALOG, setModelsDirResolver } from '../../src/transcribe/model-manager.js';

const ENV_KEYS = ['WHISPER_CPP_PATH', 'WHISPER_MODEL_DIR', 'WHISPER_MODEL_PATH'];
let savedEnv = {};

/** Reduz o catálogo de um modelo para um arquivo pequeno (testes sem 465 MB). */
function shrinkModel(model) {
  const original = { ...MODEL_CATALOG[model] };
  Object.assign(MODEL_CATALOG[model], { expectedSize: 1000, minSize: 100, sha256: null });
  return () => Object.assign(MODEL_CATALOG[model], original);
}

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

test('checkWhisperCpp: motor disponível mesmo sem nenhum modelo baixado', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-whisper-'));
  try {
    const binPath = path.join(tmp, 'whisper-cli.exe');
    fs.writeFileSync(binPath, 'fake');
    const modelsDir = path.join(tmp, 'models');
    fs.mkdirSync(modelsDir);

    process.env.WHISPER_CPP_PATH = binPath;
    process.env.WHISPER_MODEL_DIR = modelsDir;
    const result = checkWhisperCpp();

    // Disponibilidade do motor depende só do binário: o modelo é escolha do
    // usuário e pode ser baixado depois.
    assert.equal(result.available, true);
    assert.deepEqual(fs.readdirSync(modelsDir), []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('transcribeWithCpp: modelo ausente aponta para a lista de modelos', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-whisper-'));
  try {
    const binPath = path.join(tmp, 'whisper-cli.exe');
    fs.writeFileSync(binPath, 'fake');
    const modelsDir = path.join(tmp, 'models');
    fs.mkdirSync(modelsDir);

    process.env.WHISPER_CPP_PATH = binPath;
    process.env.WHISPER_MODEL_DIR = modelsDir;

    await assert.rejects(
      transcribeWithCpp({ audioPath: path.join(tmp, 'audio.wav'), model: 'tiny' }),
      /Modelo tiny nao instalado.*Modelos Whisper/s
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('transcribeWithCpp: modelo desconhecido lista as opções do catálogo', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-whisper-'));
  try {
    const binPath = path.join(tmp, 'whisper-cli.exe');
    fs.writeFileSync(binPath, 'fake');
    process.env.WHISPER_CPP_PATH = binPath;
    process.env.WHISPER_MODEL_DIR = tmp;

    await assert.rejects(
      transcribeWithCpp({ audioPath: path.join(tmp, 'audio.wav'), model: 'gigante' }),
      /Modelo desconhecido: gigante.*tiny, base, small, medium, large-v3/s
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('transcribeWithCpp: acha o modelo baixado pelo app na pasta de dados do app', async () => {
  const engineDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-engine-'));
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-app-'));
  const restore = shrinkModel('small');

  try {
    // "Instalação" do whisper.cpp: binário presente, nenhum modelo ao lado dele.
    fs.writeFileSync(path.join(engineDir, 'whisper-cli.exe'), 'fake');
    process.env.WHISPER_CPP_PATH = path.join(engineDir, 'whisper-cli.exe');

    // Modelo baixado pela interface, na pasta gravável do app.
    const appModel = path.join(appDir, 'ggml-small.bin');
    fs.writeFileSync(appModel, Buffer.alloc(1000));
    setModelsDirResolver(() => appDir);

    const logs = [];
    await assert.rejects(
      transcribeWithCpp({
        audioPath: path.join(appDir, 'audio.wav'),
        model: 'small',
        threads: 1,
        onLog: (line) => logs.push(line),
      }),
      // O binário é falso, então falha depois — o que importa é não ser o
      // erro de "modelo não instalado" (que exigiria baixar 465 MB de novo).
      (err) => !/nao instalado/.test(err.message)
    );

    assert.ok(
      logs.some((line) => line.includes(appModel)),
      `esperava o modelo de ${appDir} no log, veio: ${logs.join(' | ')}`
    );
  } finally {
    setModelsDirResolver(null);
    restore();
    fs.rmSync(engineDir, { recursive: true, force: true });
    fs.rmSync(appDir, { recursive: true, force: true });
  }
});
