import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  REQUEST_CONTEXT_PROFILES,
  createRequestContext,
  isValidRequestContext,
  mergeRequestContext,
} from '../../src/core/request-context.js';

test('request-context: profiles suportados ficam congelados', () => {
  assert.deepEqual(REQUEST_CONTEXT_PROFILES, ['default', 'browser']);
});

test('request-context: create normaliza defaults e headers', () => {
  const context = createRequestContext({
    headers: { Referer: 'https://example.com', Authorization: 123 },
    userAgent: 'UA',
  });

  assert.deepEqual(context, {
    headers: { Referer: 'https://example.com', Authorization: '123' },
    cookies: null,
    referer: '',
    origin: '',
    userAgent: 'UA',
    profile: 'default',
  });
  assert.equal(isValidRequestContext(context), true);
});

test('request-context: create aceita cookies objeto e profile browser', () => {
  const context = createRequestContext({
    cookies: { jarId: 'default' },
    referer: 'https://origin.example/page',
    origin: 'https://origin.example',
    profile: 'browser',
  });

  assert.equal(context.cookies.jarId, 'default');
  assert.equal(context.profile, 'browser');
  assert.equal(isValidRequestContext(context), true);
});

test('request-context: merge combina headers e permite override explicito', () => {
  const merged = mergeRequestContext(
    {
      headers: { Referer: 'https://old.example', Accept: 'video/*' },
      referer: 'https://old.example',
      profile: 'default',
    },
    {
      headers: { Referer: 'https://new.example' },
      referer: '',
      profile: 'browser',
    },
  );

  assert.deepEqual(merged.headers, {
    Referer: 'https://new.example',
    Accept: 'video/*',
  });
  assert.equal(merged.referer, '');
  assert.equal(merged.profile, 'browser');
  assert.equal(isValidRequestContext(merged), true);
});

test('request-context: entradas invalidas lancam TypeError', () => {
  assert.throws(() => createRequestContext(null), TypeError);
  assert.throws(() => createRequestContext({ headers: 'x' }), TypeError);
  assert.throws(() => createRequestContext({ cookies: 'x' }), TypeError);
  assert.throws(() => createRequestContext({ profile: 'mobile' }), TypeError);
});

test('request-context: validacao rejeita shapes quebrados', () => {
  assert.equal(isValidRequestContext(null), false);
  assert.equal(isValidRequestContext({}), false);
  assert.equal(isValidRequestContext({ headers: [], cookies: null, referer: '', origin: '', userAgent: '', profile: 'default' }), false);
});
