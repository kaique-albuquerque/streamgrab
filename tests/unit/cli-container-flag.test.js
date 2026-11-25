/**
 * Testes da flag --container na CLI.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseDownloadFlags } from '../../src/cli/commands/flags.js';

test('--container mkv e lido', () => {
  assert.equal(parseDownloadFlags(['--container', 'mkv']).container, 'mkv');
});

test('--container mp4 e lido', () => {
  assert.equal(parseDownloadFlags(['--container', 'mp4']).container, 'mp4');
});

test('--container normaliza caixa', () => {
  assert.equal(parseDownloadFlags(['--container', 'MKV']).container, 'mkv');
});

test('--container invalido cai em vazio (usa setting)', () => {
  assert.equal(parseDownloadFlags(['--container', 'avi']).container, '');
  assert.equal(parseDownloadFlags(['--container']).container, '');
});

test('sem --container, container e vazio', () => {
  assert.equal(parseDownloadFlags([]).container, '');
  assert.equal(parseDownloadFlags(['--turbo']).container, '');
});