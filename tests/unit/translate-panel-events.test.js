/**
 * Testes do painel de tradução (electron/renderer/panel-translate*).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TRANSLATE_STATE_LABELS, TRANSLATE_STAGE_LABELS } from '../../electron/renderer/panel-constants.js';
import { createTranslatePanel } from '../../electron/renderer/panel-translate.js';

/** Elemento fake com o mínimo de DOM necessário (children, querySelector, eventos). */
function makeEl(tag = 'div') {
  const el = {
    tagName: tag,
    children: [],
    style: {},
    dataset: {},
    textContent: '',
    hidden: false,
    value: '',
    className: '',
    _listeners: {},
    append(...nodes) {
      el.children.push(...nodes);
    },
    appendChild(node) {
      el.children.push(node);
      return node;
    },
    addEventListener(type, fn) {
      (el._listeners[type] ||= []).push(fn);
    },
    dispatchEvent(ev) {
      for (const fn of el._listeners[ev.type] || []) fn(ev);
    },
    querySelector(sel) {
      return findIn(el, sel);
    },
    querySelectorAll(sel) {
      return findAllIn(el, sel);
    },
    get childElementCount() {
      return el.children.length;
    },
  };
  return el;
}

/** Busca por seletor simples: `.classe`, `[data-action="x"]`, `tag`. */
function matches(el, sel) {
  if (sel.startsWith('.')) return (el.className || '').split(/\s+/).includes(sel.slice(1));
  // [data-attr="value"] — o dataset e camelCase, o seletor e kebab-case.
  const attr = /^\[data-([\w-]+)="(.+)"\]$/.exec(sel);
  if (attr) {
    const key = attr[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    return el.dataset?.[key] === attr[2];
  }
  return el.tagName === sel;
}

function findAllIn(root, sel) {
  const out = [];
  for (const child of root.children || []) {
    if (matches(child, sel)) out.push(child);
    out.push(...findAllIn(child, sel));
  }
  return out;
}

function findIn(root, sel) {
  return findAllIn(root, sel)[0] || null;
}

/** Documento fake: um elemento por id, com `percentText()`. */
function fakeDoc() {
  const els = new Map();
  const get = (id) => {
    if (!els.has(id)) els.set(id, makeEl());
    return els.get(id);
  };
  return {
    percentText: () => get('translatePercent').textContent,
    getElementById: get,
    createElement: (tag) => makeEl(tag),
  };
}

/** API fake que registra as chamadas. */
function fakeApi() {
  const calls = [];
  const wrap = (name, fn) => async (...args) => {
    calls.push({ name, args });
    return fn(...args);
  };
  return {
    calls,
    pickSubtitleFile: wrap('pickSubtitleFile', async () => '/tmp/v.srt'),
    translateModels: wrap('translateModels', async () => ({ ok: true, defaultModel: 'qwen3-4b', models: [] })),
    translateModelDownload: wrap('translateModelDownload', async () => ({ ok: true })),
    translateStart: wrap('translateStart', async () => ({ ok: true, jobId: 'tl_1', job: { jobId: 'tl_1', status: 'queued' } })),
    translateJobList: wrap('translateJobList', async () => ({ ok: true, jobs: [] })),
    translateCancel: wrap('translateCancel', async () => ({ ok: true })),
    translateRemove: wrap('translateRemove', async () => ({ ok: true })),
    translateRetry: wrap('translateRetry', async () => ({ ok: true })),
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

test('modelo nao baixado: botao Baixar aparece', async () => {
  const doc = fakeDoc();
  const api = fakeApi();
  api.translateModels = async () => ({
    ok: true,
    defaultModel: 'qwen3-4b',
    models: [{ model: 'qwen3-4b', label: 'Qwen3-4B', installed: false }],
  });
  const panel = createTranslatePanel({ api, doc });
  await panel.refresh();
  assert.equal(doc.getElementById('translateModelDownloadBtn').hidden, false);
});

test('modelo baixado: botao Baixar fica oculto', async () => {
  const doc = fakeDoc();
  const api = fakeApi();
  api.translateModels = async () => ({
    ok: true,
    defaultModel: 'qwen3-4b',
    models: [{ model: 'qwen3-4b', label: 'Qwen3-4B', installed: true }],
  });
  const panel = createTranslatePanel({ api, doc });
  await panel.refresh();
  assert.equal(doc.getElementById('translateModelDownloadBtn').hidden, true);
});

test('job running: mostra barra de progresso com percentual', () => {
  const doc = fakeDoc();
  const panel = createTranslatePanel({ api: fakeApi(), doc });
  panel.handleEvent('job-updated', { jobId: 'tl_1', srtPath: '/tmp/a.srt', status: 'running', percent: 0 });
  panel.handleEvent('progress', { jobId: 'tl_1', percent: 55, stage: 'translating' });
  const item = doc.getElementById('translateList').children[0];
  const bar = item.querySelector('.transcribe-progress-bar');
  const fill = bar.querySelector('span');
  const label = item.querySelector('.transcribe-progress-label');
  assert.equal(fill.style.width, '55%');
  assert.equal(label.textContent, '55%');
});

test('job running: tem botao Cancelar', () => {
  const doc = fakeDoc();
  const panel = createTranslatePanel({ api: fakeApi(), doc });
  panel.handleEvent('job-updated', { jobId: 'tl_1', srtPath: '/tmp/a.srt', status: 'running', percent: 10 });
  const item = doc.getElementById('translateList').children[0];
  const cancelBtn = item.querySelector('[data-action="cancel"]');
  assert.ok(cancelBtn, 'botao Cancelar ausente');
});

test('job done: tem botao Remover', () => {
  const doc = fakeDoc();
  const panel = createTranslatePanel({ api: fakeApi(), doc });
  panel.handleEvent('job-updated', { jobId: 'tl_1', srtPath: '/tmp/a.srt', status: 'done', percent: 100 });
  const item = doc.getElementById('translateList').children[0];
  assert.ok(item.querySelector('[data-action="remove"]'), 'botao Remover ausente');
});

test('job error: tem botao Remover e Repetir', () => {
  const doc = fakeDoc();
  const panel = createTranslatePanel({ api: fakeApi(), doc });
  panel.handleEvent('job-updated', { jobId: 'tl_1', srtPath: '/tmp/a.srt', status: 'error', error: 'falhou' });
  const item = doc.getElementById('translateList').children[0];
  assert.ok(item.querySelector('[data-action="remove"]'), 'botao Remover ausente');
  assert.ok(item.querySelector('[data-action="retry"]'), 'botao Repetir ausente');
});

test('clicar em Cancelar chama api.translateCancel', async () => {
  const doc = fakeDoc();
  const api = fakeApi();
  const panel = createTranslatePanel({ api, doc });
  panel.handleEvent('job-updated', { jobId: 'tl_9', srtPath: '/tmp/a.srt', status: 'running', percent: 5 });
  const item = doc.getElementById('translateList').children[0];
  item.querySelector('[data-action="cancel"]').dispatchEvent({ type: 'click' });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(api.calls.some((c) => c.name === 'translateCancel'), 'translateCancel nao chamado');
});

test('clicar em Remover chama api.translateRemove', async () => {
  const doc = fakeDoc();
  const api = fakeApi();
  const panel = createTranslatePanel({ api, doc });
  panel.handleEvent('job-updated', { jobId: 'tl_8', srtPath: '/tmp/a.srt', status: 'done', percent: 100 });
  const item = doc.getElementById('translateList').children[0];
  item.querySelector('[data-action="remove"]').dispatchEvent({ type: 'click' });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(api.calls.some((c) => c.name === 'translateRemove'), 'translateRemove nao chamado');
});