import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BACKEND_IDS, selectStrategy, selectStrategyDecision } from '../../src/strategy/selector.js';

test('strategy-selector: expõe backend ids estáveis', () => {
  assert.deepEqual(BACKEND_IDS, {
    MUX: 'mux',
    DIRECT_HTTP: 'http',
    DIRECT_RANGE: 'range',
    HLS_FFMPEG: 'ffmpeg',
    DASH_FFMPEG: 'ffmpeg',
    CURL: 'curl',
    YTDLP: 'ytdlp',
  });
});

test('strategy-selector: mux retorna decisão estruturada', () => {
  const decision = selectStrategyDecision({ prepared: { strategy: 'mux' } });
  assert.equal(decision.strategy, 'mux');
  assert.equal(decision.backendId, 'mux');
  assert.equal(decision.reasonCode, 'prepared-mux');
});

test('strategy-selector: direct com turbo escolhe range com motivo claro', () => {
  const decision = selectStrategyDecision({
    sourceType: 'direct',
    options: { turbo: true },
  });
  assert.equal(decision.strategy, 'range');
  assert.equal(decision.backendId, 'direct-range');
  assert.equal(decision.reasonCode, 'direct-range-turbo');
});

test('strategy-selector: direct com hint preferredTransport=range escolhe range', () => {
  const decision = selectStrategyDecision({
    downloadPlan: {
      kind: 'direct',
      strategyHints: { preferredTransport: 'range' },
    },
  });
  assert.equal(decision.strategy, 'range');
  assert.equal(decision.reasonCode, 'direct-range-hint');
});

test('strategy-selector: hls e dash permanecem no backend ffmpeg nesta fase', () => {
  const hls = selectStrategyDecision({ downloadPlan: { kind: 'hls', strategyHints: {} } });
  const dash = selectStrategyDecision({ downloadPlan: { kind: 'dash', strategyHints: {} } });
  assert.equal(hls.strategy, 'ffmpeg');
  assert.equal(hls.backendId, 'hls-ffmpeg');
  assert.equal(dash.strategy, 'ffmpeg');
  assert.equal(dash.backendId, 'dash-ffmpeg');
});

test('strategy-selector: hls com feature gate ativa seleciona backend segmentado', () => {
  const hls = selectStrategyDecision({
    downloadPlan: { kind: 'hls', strategyHints: { preferredTransport: 'segments' } },
    runtimeCapabilities: { hlsSegments: true },
    featureFlags: { hlsSegments: true },
  });
  assert.equal(hls.strategy, 'ffmpeg');
  assert.equal(hls.backendId, 'hls-segments');
  assert.equal(hls.reasonCode, 'hls-segments');
});

test('strategy-selector: dash com feature gate ativa seleciona backend segmentado', () => {
  const dash = selectStrategyDecision({
    downloadPlan: { kind: 'dash', strategyHints: { preferredTransport: 'segments' } },
    runtimeCapabilities: { dashSegments: true },
    featureFlags: { dashSegments: true },
  });
  assert.equal(dash.strategy, 'ffmpeg');
  assert.equal(dash.backendId, 'dash-segments');
  assert.equal(dash.reasonCode, 'dash-segments');
});

test('strategy-selector: yt-dlp usa runner apenas quando pedido explicitamente', () => {
  const httpDefault = selectStrategyDecision({ sourceType: 'youtube', options: {} });
  const viaRunner = selectStrategyDecision({
    sourceType: 'youtube',
    options: { useYtDlpDownload: true, formatId: '137' },
  });
  assert.equal(httpDefault.strategy, 'http');
  assert.equal(viaRunner.strategy, 'ytdlp');
  assert.equal(viaRunner.reasonCode, 'ytdlp-runner');
});

test('strategy-selector: wrapper selectStrategy devolve apenas a estratégia', () => {
  assert.equal(selectStrategy({ kind: 'direct' }, {}, {}), 'http');
});
