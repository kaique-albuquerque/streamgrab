/**
 * Testes do campo "Formato do vídeo" na tela de Configurações.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(
  new URL('../../electron/templates/settings.html', import.meta.url),
  'utf8',
);

test('settings.html tem select de videoContainer', () => {
  assert.match(html, /data-setting="videoContainer"/);
});

test('select de videoContainer oferece mp4 e mkv', () => {
  assert.match(html, /<option value="mp4"/);
  assert.match(html, /<option value="mkv"/);
});

test('select de videoContainer esta dentro de um label.prompt', () => {
  assert.match(html, /class="prompt"[\s\S]{0,400}data-setting="videoContainer"/);
});

test('mp4 aparece antes de mkv (default primeiro)', () => {
  const mp4 = html.indexOf('<option value="mp4"');
  const mkv = html.indexOf('<option value="mkv"');
  assert.ok(mp4 > 0 && mkv > 0 && mp4 < mkv);
});