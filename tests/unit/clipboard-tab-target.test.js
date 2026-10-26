// Regressao: URL detectada na clipboard deve ir para a aba ativa; se ela ja
// estiver em uso (preenchida ou com analise/download em andamento), uma aba
// nova deve ser aberta para nao sobrescrever o trabalho atual.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { needsNewTab } from '../../electron/renderer/clipboard-target.js';

function tab({ url = '', busy = false, jobState = '' } = {}) {
  return { fields: { url: { value: url } }, busy, jobState };
}

test('needsNewTab: aba vazia recebe a URL', () => {
  assert.equal(needsNewTab(tab()), false);
});

test('needsNewTab: aba com URL preenchida abre aba nova', () => {
  assert.equal(needsNewTab(tab({ url: 'https://example.com/a.m3u8' })), true);
});

test('needsNewTab: URL so com espacos conta como vazia', () => {
  assert.equal(needsNewTab(tab({ url: '   ' })), false);
});

test('needsNewTab: analise ou download em andamento abre aba nova', () => {
  assert.equal(needsNewTab(tab({ busy: true })), true);
  assert.equal(needsNewTab(tab({ jobState: 'active' })), true);
  assert.equal(needsNewTab(tab({ jobState: 'queued' })), true);
});

test('needsNewTab: sem aba ativa, uma deve ser criada', () => {
  assert.equal(needsNewTab(null), true);
  assert.equal(needsNewTab(undefined), true);
});

test('needsNewTab: aba concluida e vazia e reutilizada', () => {
  assert.equal(needsNewTab(tab({ jobState: 'done' })), false);
});
