/**
 * Testes do cliente de chat com JSON schema
 * (src/translate/llama-cpp/chat.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { chatJson, ChatJsonError } from '../../src/translate/llama-cpp/chat.js';

test('envia response_format json_schema e devolve objeto', async () => {
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(body.response_format.json_schema.name, 'translated_subtitles');
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(init.headers.authorization, 'Bearer k');
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"1":"Oi"}' } }] }), { status: 200 });
  };
  const out = await chatJson({ baseUrl: 'http://127.0.0.1:1', apiKey: 'k', system: 's', user: 'u', schema: {}, fetchImpl });
  assert.deepEqual(out, { 1: 'Oi' });
});

test('conteudo que nao e JSON vira ChatJsonError', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ops' } }] }), { status: 200 });
  await assert.rejects(
    chatJson({ baseUrl: 'http://127.0.0.1:1', apiKey: 'k', system: 's', user: 'u', schema: {}, fetchImpl }),
    ChatJsonError,
  );
});

test('resposta HTTP 500 vira ChatJsonError com o status', async () => {
  const fetchImpl = async () => new Response('boom', { status: 500 });
  await assert.rejects(
    chatJson({ baseUrl: 'http://127.0.0.1:1', apiKey: 'k', system: 's', user: 'u', schema: {}, fetchImpl }),
    (err) => err instanceof ChatJsonError && /500/.test(err.message),
  );
});

test('JSON array (nao objeto) e rejeitado', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ message: { content: '[1,2]' } }] }), { status: 200 });
  await assert.rejects(
    chatJson({ baseUrl: 'http://127.0.0.1:1', apiKey: 'k', system: 's', user: 'u', schema: {}, fetchImpl }),
    ChatJsonError,
  );
});