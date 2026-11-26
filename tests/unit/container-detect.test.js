/**
 * Testes da detecção do container real do arquivo baixado.
 *
 * Bug de origem: com o setting MKV, uma URL direta que entrega MP4 era
 * nomeada `.mkv` e o app não avisava — o usuário descobria abrindo o arquivo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { detectContainerFromFile, containerMismatch } from '../../src/core/engine/lifecycle/container-detect.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sg-container-detect-'));
}

/** Cria um arquivo com os magic bytes de um container. */
function makeFile(dir, name, kind) {
  const p = path.join(dir, name);
  if (kind === 'mkv') {
    // EBML header (1A 45 DF A3) — Matroska/WebM.
    fs.writeFileSync(p, Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00]));
  } else if (kind === 'mp4') {
    // ISO BMFF: size(4) + 'ftyp' + major brand.
    const b = Buffer.alloc(32);
    b.writeUInt32BE(28, 0);
    b.write('ftyp', 4, 'ascii');
    b.write('isom', 8, 'ascii');
    fs.writeFileSync(p, b);
  } else {
    fs.writeFileSync(p, Buffer.alloc(64, 7));
  }
  return p;
}

test('detectContainerFromFile reconhece MKV pelos magic bytes', () => {
  const dir = tmpDir();
  try {
    const p = makeFile(dir, 'v.mkv', 'mkv');
    assert.equal(detectContainerFromFile(p), 'mkv');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('detectContainerFromFile reconhece MP4 pelos magic bytes', () => {
  const dir = tmpDir();
  try {
    const p = makeFile(dir, 'v.mp4', 'mp4');
    assert.equal(detectContainerFromFile(p), 'mp4');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('detectContainerFromFile devolve vazio para arquivo desconhecido', () => {
  const dir = tmpDir();
  try {
    const p = makeFile(dir, 'v.bin', 'other');
    assert.equal(detectContainerFromFile(p), '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('detectContainerFromFile devolve vazio para arquivo inexistente', () => {
  assert.equal(detectContainerFromFile('/nao/existe.mp4'), '');
});

test('containerMismatch: MKV pedido mas MP4 baixado', () => {
  assert.deepEqual(containerMismatch('mkv', 'mp4'), {
    requested: 'mkv',
    actual: 'mp4',
    message: 'Você pediu MKV, mas a fonte entregou MP4. Salvo como .mp4.',
  });
});

test('containerMismatch: sem divergencia devolve null', () => {
  assert.equal(containerMismatch('mkv', 'mkv'), null);
  assert.equal(containerMismatch('mp4', 'mp4'), null);
  assert.equal(containerMismatch('mkv', ''), null, 'container desconhecido nao e divergencia');
});