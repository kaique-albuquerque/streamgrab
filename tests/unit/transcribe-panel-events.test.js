// Renderer: o card de transcricao reflete o job assim que ele e enfileirado,
// sem depender do botao "Atualizar".
//
// O main process emite `added`/`started`/`progress` (broadcast) ANTES de
// responder ao `transcribe:start`, e o snapshot que volta na resposta ainda
// esta como 'queued' (o job manager tira o snapshot antes do pump). Este teste
// prova que o card nao regride para "Aguardando" nem perde a barra, e que um
// evento sem job conhecido forca a revalidacao da lista.
//
// O DOM e um stub minimo (sem jsdom): so o que o painel de transcricao usa —
// getElementById, createElement, dataset, classList, style e querySelector.

import assert from 'node:assert/strict';
import { test } from 'node:test';

const VIDEO_PATH = 'C:\\videos\\aula.mp4';

/** Converte `data-job-id` -> `jobId`. */
function datasetKey(name) {
  return name.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
}

function matchesSimple(node, part) {
  if (part.startsWith('.')) {
    return String(node.className || '')
      .split(/\s+/)
      .includes(part.slice(1));
  }
  if (part.startsWith('[')) {
    const match = /^\[data-([a-z-]+)="([^"]*)"\]$/.exec(part);
    return Boolean(match) && node.dataset?.[datasetKey(match[1])] === match[2];
  }
  return node.tagName === part.toUpperCase();
}

/** Busca em profundidade, respeitando descendencia (`.a span`). */
function find(root, parts) {
  const [head, ...rest] = parts;
  for (const child of root.children || []) {
    const matched = matchesSimple(child, head);
    if (matched && rest.length === 0) return child;
    if (matched) {
      const deeper = find(child, rest);
      if (deeper) return deeper;
    }
    const nested = find(child, parts);
    if (nested) return nested;
  }
  return null;
}

/** Elemento de DOM minimo para o renderer da lista de transcricao. */
class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.textContent = '';
    this.className = '';
    this.listeners = new Map();
    this.classList = { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false };
  }

  set innerHTML(value) {
    if (!value) this.children = [];
  }

  get innerHTML() {
    return '';
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  appendChild(node) {
    this.children.push(node);
    return node;
  }

  addEventListener(type, fn) {
    this.listeners.set(type, fn);
  }

  click() {
    return this.listeners.get('click')?.();
  }

  querySelector(selector) {
    return find(this, selector.trim().split(/\s+/));
  }
}

/** Registro de elementos por id, como o painel espera. */
function createDocument() {
  const byId = new Map();
  const seed = {
    transcribeFmtTxt: { checked: true },
    transcribeFmtMd: { checked: true },
    transcribeFmtSrt: { checked: false },
    transcribeLanguage: { value: 'pt' },
  };

  return {
    createElement: (tag) => new FakeElement(tag),
    getElementById(id) {
      if (!byId.has(id)) {
        const el = new FakeElement('div');
        Object.assign(el, seed[id] || {});
        byId.set(id, el);
      }
      return byId.get(id);
    },
  };
}

/** Deixa as promessas pendentes do clique de start resolverem. */
function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Job de transcricao no formato do snapshot devolvido pelo main. */
function job(overrides = {}) {
  return {
    jobId: 'tr_1',
    videoPath: VIDEO_PATH,
    language: 'pt',
    formats: ['txt', 'md'],
    title: '',
    model: 'small',
    status: 'queued',
    attempts: 0,
    stage: 'queued',
    percent: 0,
    error: null,
    files: [],
    engine: '',
    createdAt: 1,
    startedAt: null,
    finishedAt: null,
    nextRetryAt: null,
    ...overrides,
  };
}

/**
 * Painel de transcricao com `window.api` falso: a resposta de `transcribeStart`
 * e o snapshot 'queued' devolvido pelo main antes do pump, como acontece de
 * verdade; `listResponses` e a fila de listas autoritativas usadas nas
 * revalidacoes (a primeira alimenta o refresh inicial).
 */
async function makePanel({ listResponses = [{ ok: true, jobs: [] }] } = {}) {
  const api = {
    transcribeCheck: async () => ({
      ok: true,
      engine: 'whisper-cpp',
      whisperCpp: { available: true, binPath: 'whisper-cli' },
    }),
    transcribeModels: async () => ({
      ok: true,
      defaultModel: 'small',
      selectedModel: 'small',
      models: [{ model: 'small', label: 'Small', installed: true, size: 1, expectedSize: 1 }],
    }),
    transcribeJobList: async () => listResponses.shift() || { ok: true, jobs: [] },
    pickMediaFile: async () => VIDEO_PATH,
    transcribeStart: async () => ({ ok: true, jobId: 'tr_1', job: job() }),
    transcribeCancel: async () => ({ ok: true }),
  };

  globalThis.document = createDocument();
  globalThis.window = { api };

  const { createTranscribePanel } = await import(
    `../../electron/renderer/panel-transcribe.js?panel-test=${Date.now()}`
  );
  const panel = createTranscribePanel();
  await panel.refreshTranscribePanel();

  return {
    panel,
    api,
    startBtn: globalThis.document.getElementById('transcribeStartBtn'),
    item: () => globalThis.document.getElementById('transcribeList').querySelector('[data-job-id="tr_1"]'),
  };
}

test('renderer: card segue em execucao depois da resposta de transcribe:start', async () => {
  const harness = await makePanel();

  // Broadcasts do main: job enfileirado e, em seguida, ja em execucao.
  harness.panel.handleTranscribeEvent('job-updated', job({ status: 'queued', stage: 'queued' }));
  harness.panel.handleTranscribeEvent('job-updated', job({ status: 'running', stage: 'preparing', attempts: 1 }));

  const beforeStart = harness.item();
  assert.equal(beforeStart.querySelector('.job-state')?.textContent, 'Transcrevendo');
  assert.ok(beforeStart.querySelector('.transcribe-progress-bar'), 'barra visivel ao iniciar');

  // O clique recebe de volta o snapshot 'queued' (pre-pump) e nao pode rebaixar
  // o card para "Aguardando" nem remover a barra.
  harness.startBtn.click();
  await flush();

  const afterStart = harness.item();
  assert.equal(afterStart.querySelector('.job-state')?.textContent, 'Transcrevendo');
  assert.ok(afterStart.querySelector('.transcribe-progress-bar'), 'barra mantida apos a resposta');
});

test('renderer: progresso alimenta a barra e o estagio do card em execucao', async () => {
  const harness = await makePanel();

  harness.panel.handleTranscribeEvent('job-updated', job({ status: 'running', stage: 'preparing', attempts: 1 }));
  harness.panel.handleTranscribeEvent('progress', { jobId: 'tr_1', stage: 'transcribing', percent: 42 });

  const item = harness.item();
  assert.equal(item.querySelector('.job-state')?.textContent, 'Transcrevendo');
  assert.equal(item.querySelector('.transcribe-progress-label')?.textContent, '42%');
  assert.equal(item.querySelector('.transcribe-progress-bar span')?.style.width, '42%');
  assert.match(item.querySelector('.queue-item-url')?.textContent || '', /Transcrevendo/);
});

test('renderer: progresso de job desconhecido revalida a lista sozinho', async () => {
  // Cobre o caso em que o painel perdeu os broadcasts (ex.: job retomado de uma
  // sessao anterior e ja em execucao no main).
  const harness = await makePanel({
    listResponses: [
      { ok: true, jobs: [] },
      { ok: true, jobs: [job({ status: 'running', stage: 'transcribing', percent: 7 })] },
    ],
  });

  harness.panel.handleTranscribeEvent('progress', { jobId: 'tr_1', stage: 'transcribing', percent: 7 });
  await flush();

  const item = harness.item();
  assert.ok(item, 'card do job aparece sem clicar em Atualizar');
  assert.equal(item.querySelector('.job-state')?.textContent, 'Transcrevendo');
  assert.equal(item.querySelector('.transcribe-progress-label')?.textContent, '7%');
});

test('renderer: updateJobItemDom recusa update leve sem barra e sincroniza o pill', async () => {
  const document = createDocument();
  globalThis.document = document;

  const { createJobListRenderer } = await import(
    `../../electron/renderer/panel-transcribe-jobs.js?jobs-test=${Date.now()}`
  );
  const jobList = createJobListRenderer({ onJobAction: () => {} });

  const listEl = document.getElementById('transcribeList');
  const card = document.createElement('div');
  card.dataset.jobId = 'tr_1';
  const pill = document.createElement('span');
  pill.className = 'job-state';
  pill.dataset.state = 'queued';
  pill.textContent = 'Aguardando';
  card.appendChild(pill);
  listEl.appendChild(card);

  // Sem barra no DOM o update leve nao consegue mostrar progresso nem estagio:
  // precisa devolver false para o caller re-renderizar o card.
  assert.equal(jobList.updateJobItemDom(job({ status: 'running', stage: 'transcribing', percent: 42 })), false);

  const bar = document.createElement('div');
  bar.className = 'transcribe-progress-bar';
  const fill = document.createElement('span');
  bar.appendChild(fill);
  const label = document.createElement('span');
  label.className = 'transcribe-progress-label';
  card.append(bar, label);

  assert.equal(jobList.updateJobItemDom(job({ status: 'running', stage: 'transcribing', percent: 42 })), true);
  assert.equal(fill.style.width, '42%');
  assert.equal(label.textContent, '42%');
  assert.equal(pill.textContent, 'Transcrevendo');
  assert.equal(pill.dataset.state, 'running');
});

test('renderer: cancelamento troca o estado do card', async () => {
  const harness = await makePanel();

  harness.panel.handleTranscribeEvent('job-updated', job({ status: 'running', stage: 'transcribing', attempts: 1 }));
  harness.panel.handleTranscribeEvent(
    'error',
    job({ status: 'cancelled', stage: 'transcribing', error: 'Cancelado pelo usuario.', cancelled: true })
  );

  const item = harness.item();
  assert.equal(item.querySelector('.job-state')?.textContent, 'Cancelado');
  assert.equal(item.querySelector('.transcribe-progress-bar'), null);
});
