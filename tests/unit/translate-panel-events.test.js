/**
 * Testes do painel de tradução (electron/renderer/panel-translate*).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TRANSLATE_STATE_LABELS, TRANSLATE_STAGE_LABELS } from '../../electron/renderer/panel-constants.js';
import { createTranslatePanel } from '../../electron/renderer/panel-translate.js';

/** Documento fake mínimo: um elemento por id, com `percentText()`. */
function fakeDoc() {
  const els = new Map();
  const get = (id) => {
    if (!els.has(id)) els.set(id, { textContent: '', hidden: true, style: {} });
    return els.get(id);
  };
  return {
    percentText: () => get('translatePercent').textContent,
    getElementById: get,
  };
}

/** API fake que registra as chamadas. */
function fakeApi() {
  const calls = [];
  return {
    calls,
    pickSubtitleFile: async () => '/tmp/v.srt',
    translateModels: async () => ({ ok: true, defaultModel: 'qwen3-4b', models: [] }),
    translateModelDownload: async (_p) => ({ ok: true }),
    translateStart: async (_p) => ({ ok: true, jobId: 'tl_1', job: { jobId: 'tl_1', status: 'queued' } }),
    translateJobList: async () => ({ ok: true, jobs: [] }),
  };
}

test('stage shortening tem rotulo proprio', () => {
  assert.equal(TRANSLATE_STAGE_LABELS.shortening, 'Encurtando legendas');
});

test('estados de traducao tem rotulos proprios', () => {
  assert.equal(TRANSLATE_STATE_LABELS.running, 'Traduzindo');
  assert.equal(TRANSLATE_STATE_LABELS.done, 'Traduzido');
});

test('evento progress atualiza percentual do job', () => {
  const doc = fakeDoc();
  const panel = createTranslatePanel({ api: fakeApi(), doc });
  panel.handleEvent('progress', { jobId: 'tl_1', percent: 42 });
  assert.equal(doc.percentText(), '42%');
});

test('evento done marca 100%', () => {
  const doc = fakeDoc();
  const panel = createTranslatePanel({ api: fakeApi(), doc });
  panel.handleEvent('done', { jobId: 'tl_1', files: [] });
  assert.equal(doc.percentText(), '100%');
});