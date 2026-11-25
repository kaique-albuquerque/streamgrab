/**
 * Testes da extensão final respeitando o contêiner escolhido.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extensionFor } from '../../src/core/engine/lifecycle/extension.js';

test('mux respeita o container', () => {
  assert.equal(extensionFor({ strategy: 'mux' }, '', 'mp4'), '.mp4');
  assert.equal(extensionFor({ strategy: 'mux' }, '', 'mkv'), '.mkv');
});

test('mux-multi respeita o container', () => {
  assert.equal(extensionFor({ strategy: 'mux-multi' }, '', 'mkv'), '.mkv');
  assert.equal(extensionFor({ strategy: 'mux-multi' }, '', 'mp4'), '.mp4');
});

test('hls e dash respeitam o container', () => {
  assert.equal(extensionFor({ strategy: 'single' }, 'hls', 'mkv'), '.mkv');
  assert.equal(extensionFor({ strategy: 'single' }, 'dash', 'mkv'), '.mkv');
  assert.equal(extensionFor({ strategy: 'single' }, 'hls', 'mp4'), '.mp4');
  assert.equal(extensionFor({ strategy: 'single' }, 'dash', 'mp4'), '.mp4');
});

test('URL direta COM extensao mantem a extensao dela', () => {
  assert.equal(extensionFor({ downloadUrl: 'https://x/v.ts' }, 'direct', 'mkv'), '.ts');
  assert.equal(extensionFor({ downloadUrl: 'https://x/v.webm' }, 'direct', 'mp4'), '.webm');
});

test('URL sem extensao usa o container', () => {
  assert.equal(extensionFor({ downloadUrl: 'https://x/video' }, 'direct', 'mkv'), '.mkv');
  assert.equal(extensionFor({ downloadUrl: 'https://x/video' }, 'direct', 'mp4'), '.mp4');
});

test('default (sem terceiro arg) continua mp4', () => {
  assert.equal(extensionFor({ strategy: 'mux' }), '.mp4');
  assert.equal(extensionFor({ downloadUrl: 'https://x/video' }, ''), '.mp4');
});