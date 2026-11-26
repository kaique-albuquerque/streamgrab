/**
 * Testes de validação de payload da tradução
 * (electron/security-payloads-translate.js).
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { validateTranslateStartPayload } from '../../electron/security-payloads-translate.js';

const tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function makeSrt() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-payload-'));
  tmpDirs.push(dir);
  const file = path.join(dir, 'v.srt');
  fs.writeFileSync(file, '1\n00:00:00,000 --> 00:00:01,000\nHi\n', 'utf8');
  return file;
}

test('rejeita extensao diferente de .srt', () => {
  assert.equal(validateTranslateStartPayload({ srtPath: 'C:/x/v.txt', model: 'qwen3-4b', targetLang: 'pt' }), null);
});

test('rejeita caminho inexistente', () => {
  assert.equal(validateTranslateStartPayload({ srtPath: 'C:/nao/existe.srt', model: 'qwen3-4b', targetLang: 'pt' }), null);
});

test('aceita payload valido e normaliza targetLang', () => {
  const srtReal = makeSrt();
  const p = validateTranslateStartPayload({ srtPath: srtReal, model: 'qwen3-4b', targetLang: 'PT' });
  assert.deepEqual(p, { srtPath: srtReal, model: 'qwen3-4b', targetLang: 'pt' });
});

test('rejeita modelo fora do catalogo', () => {
  const srtReal = makeSrt();
  assert.equal(validateTranslateStartPayload({ srtPath: srtReal, model: 'nao-existe', targetLang: 'pt' }), null);
});

test('rejeita payload nulo ou array', () => {
  assert.equal(validateTranslateStartPayload(null), null);
  assert.equal(validateTranslateStartPayload([]), null);
});