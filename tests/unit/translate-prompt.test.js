/**
 * Testes de blocos, prompt e medição de leitura
 * (src/translate/prompt/*).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BLOCK_SIZE, toBlocks } from '../../src/translate/prompt/blocks.js';
import { buildSchema } from '../../src/translate/prompt/schema.js';
import { buildSystemPrompt, buildUserPrompt } from '../../src/translate/prompt/schema.js';
import { charsPerSecondOf, overTarget } from '../../src/translate/prompt/measure.js';

test('blocos de 30 sem sobreposicao e sem perder cues', () => {
  const cues = Array.from({ length: 65 }, (_, i) => ({ index: i + 1 }));
  const blocks = toBlocks(cues);
  assert.deepEqual(blocks.map((b) => b.length), [30, 30, 5]);
  assert.equal(blocks.flat().length, 65);
  assert.equal(BLOCK_SIZE, 30);
});

test('duracao zero e tratada como 1 segundo', () => {
  const cps = charsPerSecondOf({ text: 'abcdefghij', startMs: 1000, endMs: 1000 });
  assert.equal(cps, 10);
});

test('segmentos acima do alvo sao listados', () => {
  const cues = [
    { index: 1, startMs: 0, endMs: 1000, text: 'a'.repeat(40) },
    { index: 2, startMs: 0, endMs: 4000, text: 'a'.repeat(40) },
  ];
  assert.deepEqual(overTarget(cues, { 1: 'a'.repeat(40), 2: 'a'.repeat(40) }, 17), [1]);
});

test('schema exige objeto com chaves string', () => {
  const s = buildSchema();
  assert.equal(s.type, 'object');
  assert.equal(s.additionalProperties.type, 'string');
});

test('system prompt pede condensacao com o alvo numerico', () => {
  assert.match(buildSystemPrompt({ targetLang: 'pt', charsPerSecond: 17 }), /17/);
});

test('user prompt lista indice, segundos e texto', () => {
  const cues = [{ index: 3, startMs: 1000, endMs: 2500, lines: ['Hello'] }];
  const prompt = buildUserPrompt(cues);
  assert.match(prompt, /3/);
  assert.match(prompt, /Hello/);
});