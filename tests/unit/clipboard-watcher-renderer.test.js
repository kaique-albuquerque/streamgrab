// Renderer: URL detectada na clipboard escolhe corretamente a aba de destino.
//
// O toast e mockado (sem DOM real); appState/tabsController sao stubs que
// imitam o controller de abas para provar que uma aba nova so e criada
// quando a aba ativa ja esta em uso.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { mock } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const TOAST_URL = pathToFileURL(path.join(ROOT, 'electron', 'renderer', 'clipboard-toast.js')).href;

let shown = null;

mock.module(TOAST_URL, {
  namedExports: {
    createClipboardToast: () => ({
      show: (options) => {
        shown = options;
      },
      dismiss: () => {},
      destroy: () => {},
    }),
  },
});

/** Stub minimo de campo de formulario. */
function field(value = '') {
  return {
    value,
    events: [],
    dispatchEvent(event) {
      this.events.push(event.type);
    },
  };
}

/** Stub de aba (apenas os campos usados pelo fluxo da clipboard). */
function makeTab({ url = '', jobState = '', busy = false } = {}) {
  return {
    id: `tab-${Math.random()}`,
    busy,
    jobState,
    fields: { url: field(url), analyzeBtn: { clicks: 0, click() { this.clicks += 1; } } },
  };
}

/** appState + tabsController falsos, imitando addTab/activateTab. */
function makeHarness(initialTab) {
  const state = { tabs: new Map(), activeTabId: '', next: 1 };
  let created = 0;

  const first = { ...initialTab, id: 'tab-0' };
  state.tabs.set('tab-0', first);
  state.activeTabId = 'tab-0';

  const tabsController = {
    addTab() {
      created += 1;
      const id = `tab-${created}`;
      state.tabs.set(id, { ...makeTab(), id });
      state.activeTabId = id;
    },
  };

  return { state, tabsController, createdCount: () => created };
}

globalThis.document = { getElementById: () => ({ id: 'tabTemplate' }) };
delete globalThis.window;

let detected = null;
globalThis.window = { api: { onClipboardDetected: (cb) => { detected = cb; } } };

const { setupClipboardWatcher } = await import(
  `../../electron/renderer/bootstrap/clipboard.js?clipboard-test=${Date.now()}`
);

test('clipboard: aba vazia recebe a URL, sem criar outra aba', () => {
  const tab = makeTab();
  const harness = makeHarness(tab);
  shown = null;

  setupClipboardWatcher({ appState: harness.state, tabsController: harness.tabsController });
  detected({ url: 'https://example.com/a.m3u8', sourceType: 'hls' });
  shown.onFillOnly('https://example.com/a.m3u8');

  assert.equal(harness.createdCount(), 0);
  assert.equal(tab.fields.url.value, 'https://example.com/a.m3u8');
  assert.deepEqual(tab.fields.url.events, ['input']);
});

test('clipboard: aba ja preenchida abre uma aba nova e a preenche', () => {
  const tab = makeTab({ url: 'https://example.com/antigo.m3u8' });
  const harness = makeHarness(tab);
  shown = null;

  setupClipboardWatcher({ appState: harness.state, tabsController: harness.tabsController });
  detected({ url: 'https://example.com/novo.m3u8', sourceType: 'hls' });
  shown.onFillOnly('https://example.com/novo.m3u8');

  assert.equal(harness.createdCount(), 1);
  const active = harness.state.tabs.get(harness.state.activeTabId);
  assert.equal(active.fields.url.value, 'https://example.com/novo.m3u8');
  assert.equal(tab.fields.url.value, 'https://example.com/antigo.m3u8', 'aba original intacta');
});

test('clipboard: analisar em aba ocupada abre aba nova e dispara a analise', () => {
  const tab = makeTab({ jobState: 'active' });
  const harness = makeHarness(tab);
  shown = null;

  setupClipboardWatcher({ appState: harness.state, tabsController: harness.tabsController });
  detected({ url: 'https://example.com/b.mpd', sourceType: 'dash' });
  shown.onAnalyze('https://example.com/b.mpd');

  assert.equal(harness.createdCount(), 1);
  const active = harness.state.tabs.get(harness.state.activeTabId);
  assert.equal(active.fields.url.value, 'https://example.com/b.mpd');
  assert.equal(active.fields.analyzeBtn.clicks, 1);
  assert.equal(tab.fields.analyzeBtn.clicks, 0, 'aba ocupada nao e analisada');
});

test('clipboard: sem abas e sem template, o clique e ignorado sem erro', () => {
  const harness = makeHarness(makeTab());
  harness.state.tabs.clear();
  harness.state.activeTabId = '';
  shown = null;

  const savedGet = globalThis.document.getElementById;
  globalThis.document.getElementById = () => null;
  try {
    setupClipboardWatcher({ appState: harness.state, tabsController: harness.tabsController });
    detected({ url: 'https://example.com/c.m3u8', sourceType: 'hls' });
    assert.doesNotThrow(() => shown.onFillOnly('https://example.com/c.m3u8'));
    assert.equal(harness.createdCount(), 0);
  } finally {
    globalThis.document.getElementById = savedGet;
  }
});
