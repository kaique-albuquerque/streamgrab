import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeHeaders } from '../../src/core/header-utils.js';

test('header-utils: normalizeHeaders canonicalizes known headers', () => {
  const result = normalizeHeaders({ 'user-agent': 'test', referer: 'https://example.com' });
  assert.equal(result['User-Agent'], 'test');
  assert.equal(result.Referer, 'https://example.com');
});

test('header-utils: normalizeHeaders removes empty values', () => {
  const result = normalizeHeaders({ 'User-Agent': '', Accept: null, Referer: '  ' });
  assert.equal(Object.keys(result).length, 0);
});

test('header-utils: normalizeHeaders preserves unknown headers', () => {
  const result = normalizeHeaders({ 'X-Custom': 'value' });
  assert.equal(result['X-Custom'], 'value');
});

test('header-utils: normalizeHeaders handles null/undefined input', () => {
  assert.deepEqual(normalizeHeaders(null), {});
  assert.deepEqual(normalizeHeaders(undefined), {});
});

test('header-utils: normalizeHeaders sanitizes CRLF and NUL characters from header values', () => {
  const result = normalizeHeaders({
    'User-Agent': 'Mozilla/5.0\r\nX-Injected: evil\r\n',
    Authorization: 'Bearer secret\0token',
  });
  assert.equal(result['User-Agent'], 'Mozilla/5.0X-Injected: evil');
  assert.equal(result.Authorization, 'Bearer secrettoken');
});

test('header-utils: normalizeHeaders ignores prototype pollution keys', () => {
  const rawObj = JSON.parse('{"__proto__": {"polluted": true}, "constructor": "bad", "prototype": "bad", "Referer": "https://example.com"}');
  const result = normalizeHeaders(rawObj);
  assert.deepEqual(result, { Referer: 'https://example.com' });
  assert.equal(Object.prototype.polluted, undefined);
});
