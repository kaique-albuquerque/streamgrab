/**
 * Testes da validação de `container` no payload de queue:enqueue.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateQueueEnqueuePayload } from '../../electron/security-payloads-queue/queue-enqueue.js';

test('container mkv passa e e normalizado', () => {
  const p = validateQueueEnqueuePayload({ url: 'https://x/v', container: 'MKV' });
  assert.equal(p.container, 'mkv');
});

test('container mp4 passa', () => {
  assert.equal(validateQueueEnqueuePayload({ url: 'https://x/v', container: 'mp4' }).container, 'mp4');
});

test('container invalido vira vazio (usa setting)', () => {
  assert.equal(validateQueueEnqueuePayload({ url: 'https://x/v', container: 'avi' }).container, '');
  assert.equal(validateQueueEnqueuePayload({ url: 'https://x/v', container: 42 }).container, '');
  assert.equal(validateQueueEnqueuePayload({ url: 'https://x/v', container: '../../x' }).container, '');
});

test('sem container vira vazio', () => {
  assert.equal(validateQueueEnqueuePayload({ url: 'https://x/v' }).container, '');
});

test('payload invalido continua null', () => {
  assert.equal(validateQueueEnqueuePayload({ url: 'ftp://x', container: 'mkv' }), null);
});