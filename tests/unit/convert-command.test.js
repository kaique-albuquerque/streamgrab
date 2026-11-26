/**
 * Testes do subcomando `convert` da CLI.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseCliCommand } from '../../src/cli/commands/parse-command.js';
import { parseConvertFlags } from '../../src/cli/commands/convert.js';

test('convert reconhece subcomando e caminho', () => {
  const { command, url, rest } = parseCliCommand(['convert', 'a.mp4']);
  assert.equal(command, 'convert');
  assert.equal(url, 'a.mp4');
  assert.deepEqual(rest, []);
});

test('parseConvertFlags le --output', () => {
  assert.deepEqual(parseConvertFlags(['--output', '/tmp']), { outputDir: '/tmp' });
});

test('parseConvertFlags sem --output devolve vazio', () => {
  assert.deepEqual(parseConvertFlags([]), { outputDir: '' });
});