/**
 * Testes da validação de payload da conversão.
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { validateConvertPayload } from '../../electron/security-payloads-convert.js';

const cleanups = [];

afterEach(() => {
  while (cleanups.length) {
    try {
      cleanups.pop()();
    } catch {
      /* best-effort */
    }
  }
});

function tmpFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-conv-payload-'));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  const p = path.join(dir, name);
  fs.writeFileSync(p, Buffer.alloc(64, 1));
  return p;
}

test('aceita .mp4 absoluto existente', () => {
  const p = tmpFile('a.mp4');
  assert.deepEqual(validateConvertPayload({ inputPath: p }), { inputPath: p });
});

test('rejeita extensao nao-video', () => {
  const p = tmpFile('a.txt');
  assert.equal(validateConvertPayload({ inputPath: p }), null);
});

test('rejeita caminho inexistente', () => {
  assert.equal(validateConvertPayload({ inputPath: '/nao/existe.mp4' }), null);
});

test('rejeita caminho relativo', () => {
  assert.equal(validateConvertPayload({ inputPath: 'a.mp4' }), null);
});

test('rejeita payload nulo ou array', () => {
  assert.equal(validateConvertPayload(null), null);
  assert.equal(validateConvertPayload([]), null);
});

test('rejeita traversal', () => {
  assert.equal(validateConvertPayload({ inputPath: '/tmp/../etc/passwd' }), null);
});