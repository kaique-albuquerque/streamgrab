/**
 * Testes do pipeline de tradução (src/translate/pipeline.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseSrt } from '../../src/translate/srt/parse.js';
import { translateSrt } from '../../src/translate/pipeline.js';

test('traduz todos os blocos e mantem index/timing originais', async () => {
  const doc = parseSrt('1\n00:00:00,000 --> 00:00:02,000\nHello\n\n2\n00:00:02,000 --> 00:00:04,000\nWorld\n');
  const chat = async ({ user }) => (user.includes('Hello') ? { 1: 'Ola', 2: 'Mundo' } : {});
  const out = await translateSrt({ cues: doc.cues, doc, chat, charsPerSecond: 17 });
  assert.equal(out.cues[0].index, 1);
  assert.equal(out.cues[0].timing, '00:00:00,000 --> 00:00:02,000');
  assert.equal(out.cues[0].translatedLines.join(' '), 'Ola');
});

test('indice ausente na resposta gera erro com a lista de faltantes', async () => {
  const doc = parseSrt('1\n00:00:00,000 --> 00:00:02,000\nHello\n\n2\n00:00:02,000 --> 00:00:04,000\nWorld\n');
  const chat = async () => ({ 1: 'Ola' });
  await assert.rejects(translateSrt({ cues: doc.cues, doc, chat }), /2/);
});

test('segundo passe so recebe os indices acima do alvo', async () => {
  const chamadas = [];
  const chat = async (req) => {
    chamadas.push(req.user);
    return req.user.includes('encurte') ? { 1: 'curto' } : { 1: 'a'.repeat(80) };
  };
  const doc = parseSrt('1\n00:00:00,000 --> 00:00:01,000\nHello\n');
  await translateSrt({ cues: doc.cues, doc, chat, charsPerSecond: 17 });
  assert.equal(chamadas.length, 2);
});

test('emite progresso translating e shortening', async () => {
  const events = [];
  const chat = async (req) => (req.user.includes('encurte') ? { 1: 'curto' } : { 1: 'a'.repeat(80) });
  const doc = parseSrt('1\n00:00:00,000 --> 00:00:01,000\nHello\n');
  await translateSrt({ cues: doc.cues, doc, chat, charsPerSecond: 17, onProgress: (e) => events.push(e) });
  const stages = events.map((e) => e.stage);
  assert.ok(stages.includes('translating'));
  assert.ok(stages.includes('shortening'));
});