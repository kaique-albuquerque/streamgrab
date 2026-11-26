/**
 * Testes da reconciliação entre container pedido e container real.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { reconcileContainer } from '../../src/core/engine/lifecycle/container-reconcile.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sg-reconcile-'));
}

function makeFile(dir, name, kind) {
  const p = path.join(dir, name);
  if (kind === 'mkv') {
    fs.writeFileSync(p, Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00]));
  } else if (kind === 'mp4') {
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

test('MKV pedido, MP4 baixado: renomeia para .mp4 e avisa', () => {
  const dir = tmpDir();
  try {
    const p = makeFile(dir, 'video.mkv', 'mp4');
    const r = reconcileContainer({ filePath: p, requested: 'mkv' });
    assert.equal(r.filePath, path.join(dir, 'video.mp4'));
    assert.equal(r.changed, true);
    assert.match(r.message, /MP4/);
    assert.ok(fs.existsSync(r.filePath));
    assert.equal(fs.existsSync(p), false, 'nome antigo nao deve sobrar');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('MKV pedido, MKV baixado: nao mexe', () => {
  const dir = tmpDir();
  try {
    const p = makeFile(dir, 'video.mkv', 'mkv');
    const r = reconcileContainer({ filePath: p, requested: 'mkv' });
    assert.equal(r.filePath, p);
    assert.equal(r.changed, false);
    assert.equal(r.message, '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('container desconhecido: nao mexe', () => {
  const dir = tmpDir();
  try {
    const p = makeFile(dir, 'video.mkv', 'other');
    const r = reconcileContainer({ filePath: p, requested: 'mkv' });
    assert.equal(r.filePath, p);
    assert.equal(r.changed, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('arquivo inexistente: nao mexe e nao lanca', () => {
  const r = reconcileContainer({ filePath: '/nao/existe.mkv', requested: 'mkv' });
  assert.equal(r.changed, false);
  assert.equal(r.filePath, '/nao/existe.mkv');
});

test('destino ja existe: nao sobrescreve, mantem o original', () => {
  const dir = tmpDir();
  try {
    const p = makeFile(dir, 'video.mkv', 'mp4');
    const other = makeFile(dir, 'video.mp4', 'mkv'); // ja existe
    const r = reconcileContainer({ filePath: p, requested: 'mkv' });
    assert.equal(r.changed, false, 'nao sobrescreve arquivo existente');
    assert.ok(fs.existsSync(p), 'original intacto');
    assert.ok(fs.existsSync(other));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});