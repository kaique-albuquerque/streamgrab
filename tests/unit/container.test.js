/**
 * Testes do módulo de formato de contêiner (MP4/MKV).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTAINERS,
  DEFAULT_CONTAINER,
  normalizeContainer,
  extensionForContainer,
  containerOutputArgs,
} from '../../src/core/engine/lifecycle/container.js';

test('normalizeContainer aceita mp4/mkv em qualquer caixa', () => {
  assert.equal(normalizeContainer('mp4'), 'mp4');
  assert.equal(normalizeContainer('MKV'), 'mkv');
  assert.equal(normalizeContainer(' mkv '), 'mkv');
  assert.equal(normalizeContainer('Mp4'), 'mp4');
});

test('normalizeContainer cai em mp4 para lixo, vazio e nao-string', () => {
  assert.equal(normalizeContainer('avi'), 'mp4');
  assert.equal(normalizeContainer(''), 'mp4');
  assert.equal(normalizeContainer(undefined), 'mp4');
  assert.equal(normalizeContainer(null), 'mp4');
  assert.equal(normalizeContainer(42), 'mp4');
  assert.equal(normalizeContainer('/home/user/Downloads'), 'mp4');
});

test('normalizeContainer nunca resolve propriedade herdada', () => {
  assert.equal(normalizeContainer('constructor'), 'mp4');
  assert.equal(normalizeContainer('__proto__'), 'mp4');
  assert.equal(normalizeContainer('toString'), 'mp4');
});

test('extensionForContainer devolve a extensao com ponto', () => {
  assert.equal(extensionForContainer('mp4'), '.mp4');
  assert.equal(extensionForContainer('mkv'), '.mkv');
});

test('containerOutputArgs: movflags so em mp4', () => {
  assert.deepEqual(containerOutputArgs('mp4'), ['-movflags', '+faststart']);
  assert.deepEqual(containerOutputArgs('mkv'), []);
});

test('CONTAINERS e DEFAULT_CONTAINER', () => {
  assert.deepEqual(CONTAINERS, ['mp4', 'mkv']);
  assert.equal(DEFAULT_CONTAINER, 'mp4');
});