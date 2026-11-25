/**
 * Testes da allowlist de `videoContainer` no payload de settings.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateSettingsPayload } from '../../electron/security-payloads-queue/settings.js';

test('videoContainer aceita mp4 e mkv', () => {
  assert.deepEqual(validateSettingsPayload({ videoContainer: 'mp4' }), { videoContainer: 'mp4' });
  assert.deepEqual(validateSettingsPayload({ videoContainer: 'MKV' }), { videoContainer: 'mkv' });
  assert.deepEqual(validateSettingsPayload({ videoContainer: ' Mkv ' }), { videoContainer: 'mkv' });
});

test('videoContainer rejeita valor fora da allowlist', () => {
  assert.equal(validateSettingsPayload({ videoContainer: 'avi' }), null);
  assert.equal(validateSettingsPayload({ videoContainer: 'webm' }), null);
  assert.equal(validateSettingsPayload({ videoContainer: '../../etc/passwd' }), null);
  assert.equal(validateSettingsPayload({ videoContainer: 123 }), null);
  assert.equal(validateSettingsPayload({ videoContainer: '' }), null);
});

test('payload com chave desconhecida continua ignorado', () => {
  assert.deepEqual(validateSettingsPayload({ videoContainer: 'mkv', chaveInventada: 1 }), { videoContainer: 'mkv' });
});

test('videoContainer convive com outros settings', () => {
  const out = validateSettingsPayload({ videoContainer: 'mkv', maxConcurrentDownloads: 4 });
  assert.deepEqual(out, { videoContainer: 'mkv', maxConcurrentDownloads: 4 });
});