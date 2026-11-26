/**
 * Testes da espera pelo modelo de tradução.
 *
 * Bug de origem: o job era enfileirado enquanto o modelo ainda baixava e
 * falhava 3x com "modelo não baixado" em vez de esperar.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { waitForTranslateModel } from '../../src/translate/wait-model.js';

test('modelo ja instalado: resolve imediatamente', async () => {
  let calls = 0;
  const r = await waitForTranslateModel({
    model: 'qwen3-4b',
    isInstalled: () => { calls++; return true; },
    waitMs: 10,
    maxWaitMs: 1000,
  });
  assert.equal(r.installed, true);
  assert.equal(calls, 1);
});

test('modelo instalado depois de 3 polls', async () => {
  let calls = 0;
  const r = await waitForTranslateModel({
    model: 'qwen3-4b',
    isInstalled: () => { calls++; return calls >= 3; },
    waitMs: 5,
    maxWaitMs: 1000,
  });
  assert.equal(r.installed, true);
  assert.ok(calls >= 3);
});

test('timeout: devolve installed false sem lancar', async () => {
  const r = await waitForTranslateModel({
    model: 'qwen3-4b',
    isInstalled: () => false,
    waitMs: 5,
    maxWaitMs: 40,
  });
  assert.equal(r.installed, false);
  assert.match(r.message, /não foi baixado/i);
});

test('abort: para de esperar e devolve installed false', async () => {
  const ac = new AbortController();
  let calls = 0;
  const r = await waitForTranslateModel({
    model: 'qwen3-4b',
    isInstalled: () => { calls++; ac.abort(); return false; },
    waitMs: 5,
    maxWaitMs: 5000,
    signal: ac.signal,
  });
  assert.equal(r.installed, false);
  assert.ok(calls <= 2, 'nao deve continuar apos abort');
});

test('onWaiting e chamado enquanto espera', async () => {
  const seen = [];
  let calls = 0;
  await waitForTranslateModel({
    model: 'qwen3-4b',
    isInstalled: () => { calls++; return calls >= 2; },
    waitMs: 5,
    maxWaitMs: 1000,
    onWaiting: (info) => seen.push(info),
  });
  assert.ok(seen.length >= 1);
  assert.equal(seen[0].model, 'qwen3-4b');
});