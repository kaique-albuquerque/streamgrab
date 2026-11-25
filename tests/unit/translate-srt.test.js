/**
 * Testes de parse e build de SRT (src/translate/srt/parse.js e build.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseSrt } from '../../src/translate/srt/parse.js';
import { buildSrt } from '../../src/translate/srt/build.js';

test('build(parse(x)) preserva timing e eol', () => {
  const src = '1\r\n00:00:01,000 --> 00:00:02,500\r\nHello\r\n\r\n2\r\n00:00:02,600 --> 00:00:04,000\r\nWorld\r\n';
  const doc = parseSrt(src);
  assert.equal(doc.eol, '\r\n');
  assert.equal(buildSrt(doc), src);
});

test('BOM e removido e nao vira parte do indice', () => {
  const doc = parseSrt('\uFEFF1\n00:00:00,000 --> 00:00:01,000\nHi\n');
  assert.equal(doc.cues[0].index, 1);
  assert.equal(doc.bom, '\uFEFF');
});

test('cue multilinha mantem as linhas separadas', () => {
  const doc = parseSrt('1\n00:00:00,000 --> 00:00:02,000\nlinha um\nlinha dois\n');
  assert.deepEqual(doc.cues[0].lines, ['linha um', 'linha dois']);
});

test('tags de formatacao sobrevivem ao round-trip sem alterar timing', () => {
  const src = '1\n00:00:00,000 --> 00:00:02,000\n<i>Hello</i> {\\an8}World\n';
  const doc = parseSrt(src);
  assert.equal(doc.cues[0].lines[0], '<i>Hello</i> {\\an8}World');
  assert.equal(buildSrt(doc), src);
});

test('cue malformado e descartado e contado em skipped', () => {
  // Bloco com índice numérico mas linha de tempo inválida: é um cue malformado
  // e deve ser contado. Linhas de texto soltas (sem índice) não são cues.
  const src = '1\n00:00:00,000 --> 00:00:01,000\nOk\n\n2\nnot-a-timing\n';
  const doc = parseSrt(src);
  assert.equal(doc.cues.length, 1);
  assert.equal(doc.skipped, 1);
});

test('parse aceita duracao zero e preserva o timing original', () => {
  const doc = parseSrt('1\n00:00:00,000 --> 00:00:00,000\nZero\n');
  assert.equal(doc.cues[0].startMs, 0);
  assert.equal(doc.cues[0].endMs, 0);
  assert.equal(doc.cues[0].timing, '00:00:00,000 --> 00:00:00,000');
});