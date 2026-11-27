// Análise de playlist DASH na aba de vídeo (electron/renderer).
//
// Reproduz o fluxo real: clique em "Analisar playlist" -> analyzePlaylist ->
// renderMediaInfo/renderQualities. O backend sempre funcionou; este teste
// garante que o caminho `kind === 'dash'` não quebre a UI.

import assert from 'node:assert/strict';
import { test } from 'node:test';

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.style = {};
    this.classList = { add() {}, remove() {}, toggle() {} };
    this._text = '';
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.listeners = {};
  }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  set innerHTML(v) { this._text = String(v); }
  get innerHTML() { return this._text; }
  cloneNode() { return new FakeElement(this.tagName); }
  append(...kids) { this.children.push(...kids); }
  appendChild(kid) { this.children.push(kid); return kid; }
  removeAttribute() {}
  setAttribute() {}
  addEventListener(ev, fn) { this.listeners[ev] = fn; }
  removeEventListener() {}
  click() { this.listeners.click?.(); }
  querySelector(sel) {
    if (!this._map) this._map = new Map();
    if (!this._map.has(sel)) this._map.set(sel, new FakeElement('div'));
    return this._map.get(sel);
  }
  querySelectorAll() { return []; }
}

const DASH_MPD = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT5M8.533S">
  <Period>
    <AdaptationSet mimeType="video/mp4" contentType="video">
      <SegmentTemplate timescale="90000" duration="2700000" startNumber="1"
        initialization="init-$RepresentationID$.mp4"
        media="seg-$RepresentationID$-$Number%09d$.mp4"/>
      <Representation id="1" width="1920" height="1080" bandwidth="8500000" codecs="avc1.640028"/>
      <Representation id="3" width="640" height="360" bandwidth="1500000" codecs="avc1.64001f"/>
    </AdaptationSet>
    <AdaptationSet mimeType="audio/mp4" lang="eng">
      <SegmentTemplate timescale="24000" duration="720000" startNumber="1"
        initialization="ainit-$RepresentationID$.mp4"
        media="aseg-$RepresentationID$-$Number%09d$.mp4"/>
      <Representation id="4" bandwidth="96000" codecs="mp4a.40.5"/>
    </AdaptationSet>
  </Period>
</MPD>`;

test('analyzeTab DASH: analisa .mpd e renderiza sem erro', async () => {
  const elements = new Map();
  const panel = new FakeElement('div');
  panel.querySelector = (sel) => {
    if (!elements.has(sel)) elements.set(sel, new FakeElement('div'));
    return elements.get(sel);
  };
  panel.cloneNode = () => panel;

  globalThis.document = { createElement: (t) => new FakeElement(t) };
  globalThis.window = {
    api: {
      analyzePlaylist: async ({ url }) => {
        assert.match(url, /\.mpd$/);
        return {
          kind: 'dash',
          workingUrl: url,
          baseUrl: 'https://cdn.example.com/dash/',
          videoRepresentations: [
            { id: '1', resolution: '1920x1080', height: 1080, width: 1920, bandwidth: 8500000, codecs: 'avc1.640028', baseUrl: '' },
            { id: '3', resolution: '640x360', height: 360, width: 640, bandwidth: 1500000, codecs: 'avc1.64001f', baseUrl: '' },
          ],
          media: {
            title: 'Video',
            duration: 308.533,
            durationLabel: '5:09',
            sourceType: 'dash',
            protocol: 'DASH',
            provider: 'DASH (.mpd)',
            kind: 'dash',
            container: 'mp4',
            resolution: '1920x1080',
            codecs: 'avc1.640028',
            bitrate: 8500000,
            bitrateLabel: '8.50 Mbps',
            estimatedSize: 327816313,
            estimatedSizeLabel: '312.6 MB',
            formats: [],
            audioTracks: [],
            subtitleTracks: [],
          },
        };
      },
    },
  };

  try {
    const { createVideoTabsController } = await import('../../electron/renderer/video-tabs.js');
    const controller = createVideoTabsController({
      appState: { counter: 1, tabs: new Map(), activeOutputs: new Map(), defaultOutputDir: '' },
      dom: {
        tabTemplate: { content: { firstElementChild: panel } },
        tabBar: new FakeElement('div'),
        tabPanels: new FakeElement('div'),
      },
    });
    controller.addTab();

    const urlInput = elements.get('[data-field="url"]');
    urlInput.value = 'https://cdn.example.com/dash/manifest.mpd';

    const analyzeBtn = elements.get('[data-action="analyze"]');
    await analyzeBtn.click();

    const status = elements.get('[data-field="status"]');
    assert.doesNotMatch(status.textContent, /Erro ao analisar/i, `não deve dar erro: ${status.textContent}`);
    assert.match(status.textContent, /DASH/i);

    const modeLabel = elements.get('[data-field="modeLabel"]');
    assert.doesNotMatch(modeLabel.textContent, /Falha/i);
  } finally {
    delete globalThis.document;
    delete globalThis.window;
  }
});
test('analyzeTab DASH: modeLabel sai de "em andamento" apos sucesso', async () => {
  const elements = new Map();
  const panel = new FakeElement('div');
  panel.querySelector = (sel) => {
    if (!elements.has(sel)) elements.set(sel, new FakeElement('div'));
    return elements.get(sel);
  };
  panel.cloneNode = () => panel;

  globalThis.document = { createElement: (t) => new FakeElement(t) };
  globalThis.window = {
    api: {
      analyzePlaylist: async ({ url }) => ({
        kind: 'dash',
        workingUrl: url,
        baseUrl: 'https://cdn.example.com/dash/',
        videoRepresentations: [{ id: '1', resolution: '1920x1080' }],
        media: { title: 'Video', duration: 308, durationLabel: '5:09', sourceType: 'dash', kind: 'dash', container: 'mp4', formats: [] },
      }),
    },
  };

  try {
    const { createVideoTabsController } = await import('../../electron/renderer/video-tabs.js');
    const controller = createVideoTabsController({
      appState: { counter: 1, tabs: new Map(), activeOutputs: new Map(), defaultOutputDir: '' },
      dom: {
        tabTemplate: { content: { firstElementChild: panel } },
        tabBar: new FakeElement('div'),
        tabPanels: new FakeElement('div'),
      },
    });
    controller.addTab();
    elements.get('[data-field="url"]').value = 'https://cdn.example.com/dash/manifest.mpd';
    await elements.get('[data-action="analyze"]').click();

    const modeLabel = elements.get('[data-field="modeLabel"]');
    assert.doesNotMatch(modeLabel.textContent, /em andamento/i, `modeLabel deve sair de "em andamento": ${modeLabel.textContent}`);
    assert.match(modeLabel.textContent, /DASH/i);
  } finally {
    delete globalThis.document;
    delete globalThis.window;
  }
});
