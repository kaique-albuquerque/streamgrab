/**
 * Testes do parsing da porta do llama-server.
 *
 * Bug de origem: a regex capturava "127" do IP 127.0.0.1 em vez da porta
 * real, e o startServer nunca ficava saudável.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parsePortFromLog } from '../../src/translate/llama-cpp/log-parse.js';

test('extrai a porta da linha listening', () => {
  const line = '0.00.686.679 I srv  server_on_li: listening on http://127.0.0.1:57815';
  assert.equal(parsePortFromLog(line), 57815);
});

test('extrai a porta de uma linha "port N"', () => {
  assert.equal(parsePortFromLog('server listening on port 8080'), 8080);
});

test('ignora o IP 127.0.0.1 e pega a porta', () => {
  const line = 'listening on http://127.0.0.1:3000';
  assert.equal(parsePortFromLog(line), 3000);
});

test('sem porta na linha devolve 0', () => {
  assert.equal(parsePortFromLog('model loaded'), 0);
  assert.equal(parsePortFromLog(''), 0);
});

test('porta de 4-5 digitos funciona', () => {
  assert.equal(parsePortFromLog('listening on http://127.0.0.1:1234'), 1234);
  assert.equal(parsePortFromLog('listening on http://127.0.0.1:65535'), 65535);
});