/**
 * Testes do card de conversão para MKV.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createConvertPanel } from '../../electron/renderer/panel-convert.js';

const html = fs.readFileSync(
  new URL('../../electron/templates/transcribe.html', import.meta.url),
  'utf8',
);

/** Documento fake: um elemento por id. */
function fakeDoc() {
  const els = new Map();
  const get = (id) => {
    if (!els.has(id)) els.set(id, { textContent: '', hidden: true, style: {}, addEventListener() {} });
    return els.get(id);
  };
  return { getElementById: get, querySelector: () => null };
}

/** API fake que registra chamadas. */
function fakeApi() {
  const calls = [];
  const wrap = (name, fn) => async (...args) => {
    calls.push({ name });
    return fn(...args);
  };
  return {
    calls,
    pickMediaFile: wrap('pickMediaFile', async () => '/tmp/a.mp4'),
    convertStart: wrap('convertStart', async () => ({ ok: true, jobId: 'cv_1', outputPath: '/tmp/a.mkv', size: 10 })),
    convertCancel: wrap('convertCancel', async () => ({ ok: true })),
  };
}

test('template tem o card de conversao', () => {
  assert.match(html, /id="convertStartBtn"/);
  assert.match(html, /Converter/);
});

test('painel start chama pickMediaFile e convertStart', async () => {
  const api = fakeApi();
  const panel = createConvertPanel({ api, doc: fakeDoc() });
  await panel.start();
  assert.equal(api.calls.length, 2);
  assert.equal(api.calls[0].name, 'pickMediaFile');
  assert.equal(api.calls[1].name, 'convertStart');
});

test('progresso atualiza o percentual', () => {
  const doc = fakeDoc();
  const panel = createConvertPanel({ api: fakeApi(), doc });
  panel.handleEvent('progress', { jobId: 'cv_1', percent: 42 });
  assert.equal(doc.getElementById('convertPercent').textContent, '42%');
});

test('done marca 100%', () => {
  const doc = fakeDoc();
  const panel = createConvertPanel({ api: fakeApi(), doc });
  panel.handleEvent('done', { jobId: 'cv_1', outputPath: '/tmp/a.mkv' });
  assert.equal(doc.getElementById('convertPercent').textContent, '100%');
});