import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseVersion, pickAsset, targetPaths } from '../../scripts/update-ytdlp.mjs';

test('parseVersion extrai versão da saída do --version', () => {
  assert.equal(parseVersion('2026.08.01\n'), '2026.08.01');
  assert.equal(parseVersion('2026.08.1'), '2026.08'); // segmento com 1 dígito é ignorado
  assert.equal(parseVersion('2025.12.31\n'), '2025.12.31');
  assert.equal(parseVersion(''), '');
  assert.equal(parseVersion('not a version'), '');
  assert.equal(parseVersion('python: not found'), '');
});

test('pickAsset escolhe yt-dlp.exe no Windows e yt-dlp no Unix', () => {
  const assets = [
    { name: 'yt-dlp.exe', browser_download_url: 'https://x/yt-dlp.exe' },
    { name: 'yt-dlp.tar.gz', browser_download_url: 'https://x/tar' },
  ];
  assert.equal(pickAsset(assets, { platform: 'win32' }), 'https://x/yt-dlp.exe');
  assert.equal(pickAsset(assets, { platform: 'linux' }), null); // sem asset unix
  assert.equal(pickAsset([], { platform: 'win32' }), null);
  assert.equal(pickAsset(null, { platform: 'win32' }), null);
});

test('targetPaths: retorna o primary sempre, e extras apenas se existirem', (t) => {
  // targetPaths cria o diretorio do primary: usa raiz temporaria real
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-ytdlp-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const paths = targetPaths(root);
  // Primary é sempre retornado (é obrigatório); diretórios extras não existem → só [primary]
  assert.equal(paths.length, 1, 'extras inexistentes nao devem entrar');
  assert.ok(paths[0].includes('youtube-dl-exec'), 'primeiro elemento deve ser o primary');
});
