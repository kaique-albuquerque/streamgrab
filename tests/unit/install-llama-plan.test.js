/**
 * Testes do plano de download do llama.cpp (scripts/install-llama.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildLlamaPlan } from '../../scripts/install-llama.mjs';

test('plano win x64 usa zip cpu e copia dlls', () => {
  const p = buildLlamaPlan({ platform: 'win32', arch: 'x64', tag: 'b12676' });
  assert.match(p.url, /llama-b12676-bin-win-cpu-x64\.zip$/);
  assert.equal(p.archiveType, 'zip');
  assert.equal(p.binName, 'llama-server.exe');
});

test('plano macos arm64 usa tar.gz', () => {
  const p = buildLlamaPlan({ platform: 'darwin', arch: 'arm64', tag: 'b12676' });
  assert.match(p.url, /llama-b12676-bin-macos-arm64\.tar\.gz$/);
  assert.equal(p.binName, 'llama-server');
});

test('plataforma sem asset suportado lanca erro acionavel', () => {
  assert.throws(() => buildLlamaPlan({ platform: 'win32', arch: 'arm64', tag: 'b12676' }), /nao ha binario/);
});