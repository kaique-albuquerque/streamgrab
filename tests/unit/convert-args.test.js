/**
 * Testes dos args do remux para MKV.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildRemuxArgs } from '../../src/convert/args.js';

test('usa -c copy (remux, sem re-encode)', () => {
  const args = buildRemuxArgs({ input: 'a.mp4', output: 'a.mkv' });
  assert.equal(args[args.indexOf('-c') + 1], 'copy');
  assert.equal(args.includes('libx264'), false);
});

test('mantem todas as faixas com -map 0', () => {
  const args = buildRemuxArgs({ input: 'a.mp4', output: 'a.mkv' });
  assert.equal(args[args.indexOf('-map') + 1], '0');
});

test('entrada e saida estao no lugar certo', () => {
  const args = buildRemuxArgs({ input: 'a.mp4', output: 'a.mkv' });
  assert.equal(args[args.indexOf('-i') + 1], 'a.mp4');
  assert.equal(args[args.length - 1], 'a.mkv');
});

test('nao usa shell (argv em array)', () => {
  const args = buildRemuxArgs({ input: 'a b.mp4', output: 'a b.mkv' });
  assert.ok(args.includes('a b.mp4'));
});

test('progresso via pipe:1', () => {
  const args = buildRemuxArgs({ input: 'a.mp4', output: 'a.mkv' });
  assert.equal(args[args.indexOf('-progress') + 1], 'pipe:1');
});