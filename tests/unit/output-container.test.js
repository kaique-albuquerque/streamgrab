/**
 * Testes de resolveOutput com contêiner configurável.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveOutput } from '../../src/core/engine/lifecycle/output.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sg-out-container-'));
}

/** Engine fake: `videoContainer` vem do parâmetro; qualquer outra chave = dir. */
function engineWith(container, dir) {
  return {
    settings: { get: (k) => (k === 'videoContainer' ? container : dir) },
    _reservedOutputs: new Set(),
  };
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('setting mkv gera .mkv para mux', () => {
  const dir = tmpDir();
  try {
    const out = resolveOutput(engineWith('mkv', dir), { meta: { filename: 'video' } }, { strategy: 'mux' }, dir);
    assert.ok(out.endsWith('.mkv'), out);
  } finally {
    cleanup(dir);
  }
});

test('setting mp4 gera .mp4 para mux (sem regressao)', () => {
  const dir = tmpDir();
  try {
    const out = resolveOutput(engineWith('mp4', dir), { meta: { filename: 'video' } }, { strategy: 'mux' }, dir);
    assert.ok(out.endsWith('.mp4'), out);
  } finally {
    cleanup(dir);
  }
});

test('job.meta.container tem prioridade sobre o setting', () => {
  const dir = tmpDir();
  try {
    const job = { meta: { filename: 'video', container: 'mkv' } };
    const out = resolveOutput(engineWith('mp4', dir), job, { strategy: 'mux' }, dir);
    assert.ok(out.endsWith('.mkv'), out);
  } finally {
    cleanup(dir);
  }
});

test('container fica fixado no job apos a primeira resolucao', () => {
  const dir = tmpDir();
  try {
    const engine = engineWith('mp4', dir);
    const job = { meta: { filename: 'video' } };
    const first = resolveOutput(engine, job, { strategy: 'mux' }, dir);
    engine.settings.get = () => 'mkv'; // muda o setting depois
    const second = resolveOutput(engine, job, { strategy: 'mux' }, dir);
    assert.equal(path.extname(first), path.extname(second));
    assert.equal(path.extname(first), '.mp4');
  } finally {
    cleanup(dir);
  }
});

test('containerOverride do job vence o setting na primeira resolucao', () => {
  const dir = tmpDir();
  try {
    const job = { meta: { filename: 'video', containerOverride: 'mkv' } };
    const out = resolveOutput(engineWith('mp4', dir), job, { strategy: 'mux' }, dir);
    assert.ok(out.endsWith('.mkv'), out);
    assert.equal(job.meta.container, 'mkv');
  } finally {
    cleanup(dir);
  }
});

test('URL direta com extensao nao vira mkv', () => {
  const dir = tmpDir();
  try {
    const out = resolveOutput(
      engineWith('mkv', dir),
      { meta: { filename: 'video' } },
      { downloadUrl: 'https://x/v.ts' },
      dir,
    );
    assert.ok(out.endsWith('.ts'), out);
  } finally {
    cleanup(dir);
  }
});