import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { createDefaultProviderRegistry } from '../../src/providers/registry.js';

function withServer(handler, fn) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      fn(`http://127.0.0.1:${port}`)
        .then((result) => {
          server.close();
          resolve(result);
        })
        .catch((err) => {
          server.close();
          reject(err);
        });
    });
  });
}

test('providers registry generic: gate desligado nao registra provider generic', () => {
  const registry = createDefaultProviderRegistry();
  assert.equal(registry.get('generic'), null);
});

test('providers registry generic: gate ligado registra provider generic no final da prioridade', () => {
  const registry = createDefaultProviderRegistry({ genericProvider: true });
  assert.equal(registry.get('generic')?.id, 'generic');
  const ids = registry.list().map((item) => item.id);
  assert.equal(ids.at(-1), 'generic');
});

test('providers registry generic: detectAsync usa generic para paginas HTML quando gate ligado', async () => {
  const registry = createDefaultProviderRegistry({ genericProvider: true });
  const result = await withServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html><body><video src="/video.mp4"></video></body></html>');
  }, async (base) => registry.detectAsync(`${base}/watch`, { genericProvider: true }));

  assert.equal(result.provider?.id, 'generic');
  assert.equal(result.detectedContentType, 'text/html');
});

test('providers registry generic: detectAsync continua null para HTML quando gate desligado', async () => {
  const registry = createDefaultProviderRegistry();
  const result = await withServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html></html>');
  }, async (base) => registry.detectAsync(`${base}/watch`));

  assert.equal(result.provider, null);
  assert.equal(result.detectedContentType, 'text/html');
});
