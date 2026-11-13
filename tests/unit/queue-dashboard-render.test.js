// O dashboard da Fila quebrava ao receber `progress`: `renderProgress` era
// chamado sem `getPercent`/`getMetric`, o que abortava o refresh e deixava a
// lista de jobs vazia (sem barra e sem percentual).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderDashboard } from '../../electron/renderer/dashboard-render.js';

function fakeContainer() {
  return { innerHTML: '' };
}

const activeJob = { id: 'job-1', state: 'downloading', title: 'video', meta: { filename: 'video', totalBytes: 1000 } };

test('renderDashboard: renderiza progresso de jobs ativos com percentual', () => {
  const container = fakeContainer();
  renderDashboard({
    container,
    active: [activeJob],
    queued: [],
    completed: [],
    failed: [],
    totalSpeedBps: 1000,
    etaSeconds: 10,
    totalBytes: 1000,
    downloadedBytes: 420,
    disk: null,
    getPercent: () => 42,
    getMetric: () => 1000,
  });

  assert.ok(container.innerHTML.includes('42%'), 'percentual do job nao foi renderizado');
  assert.ok(container.innerHTML.includes('width:42%'), 'largura da barra nao foi renderizada');
});

test('renderDashboard: define percentual desconhecido como 0 sem lancar', () => {
  const container = fakeContainer();
  assert.doesNotThrow(() =>
    renderDashboard({
      container,
      active: [activeJob],
      queued: [],
      completed: [],
      failed: [],
      totalSpeedBps: 0,
      etaSeconds: 0,
      totalBytes: 0,
      downloadedBytes: 0,
      disk: null,
    })
  );
  assert.ok(container.innerHTML.includes('0%'), 'percentual ausente para progresso desconhecido');
});
