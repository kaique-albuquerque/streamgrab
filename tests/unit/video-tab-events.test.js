// O `started` da fila carrega o job serializado (`id`, `state`, `meta`) — nao
// o `jobId` dos eventos de progresso. Sem mapear `payload.id`/`payload.meta`,
// a aba nunca era encontrada no inico do job e o painel ficava sem a classe
// `.downloading` (barra indeterminada) nem o status de inicio.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createQueueEventHandler, findTabForJob } from '../../electron/renderer/video-tab-events.js';

function makeTab({ id = 'tab-1', taskId = 'tab-1', jobId = '' } = {}) {
  return { id, taskId, jobId };
}

test('findTabForJob: encontra a aba pelo payload serializado do `started` (payload.id)', () => {
  const tab = makeTab();
  const appState = { tabs: new Map([[tab.id, tab]]) };
  const startedPayload = { id: 'job-1', state: 'queued', meta: { taskId: 'tab-1' } };

  assert.equal(findTabForJob(appState, startedPayload), tab);
});

test('findTabForJob: encontra a aba pelo meta.taskId do `started` mesmo antes de jobId ser conhecido', () => {
  const tab = makeTab({ taskId: 'tab-9' });
  const appState = { tabs: new Map([[tab.id, tab]]) };
  const startedPayload = { id: 'job-1', state: 'queued', meta: { taskId: 'tab-9' } };

  assert.equal(findTabForJob(appState, startedPayload), tab);
});

test('findTabForJob: continua casando pelo jobId dos eventos de progresso', () => {
  const tab = makeTab({ jobId: 'job-1' });
  const appState = { tabs: new Map([[tab.id, tab]]) };

  assert.equal(findTabForJob(appState, { jobId: 'job-1', percent: 10 }), tab);
});

// `speed`/`eta` sao criados por `createProgressPayload`, que preenche
// `percent: 0` por default. Gravar esse 0 sobrescrevia o progresso real no
// mapa consumido pelo painel da Fila (a lista ficava presa em 0%).
test('handleQueueEvent: speed/eta nao zeram o percentual do job', () => {
  const tab = makeTab({ jobId: 'job-1', busy: true });
  const appState = { tabs: new Map([[tab.id, tab]]), activeOutputs: new Map() };
  const jobProgress = new Map();
  const { handleQueueEvent } = createQueueEventHandler({
    appState,
    jobProgress,
    onQueueRefresh() {},
    onHistoryRefresh() {},
  });

  handleQueueEvent('progress', { jobId: 'job-1', percent: 42.5, stage: 'downloading' });
  assert.equal(jobProgress.get('job-1'), 42.5);

  handleQueueEvent('speed', { jobId: 'job-1', speed: 1024, percent: 0, stage: 'queued' });
  handleQueueEvent('eta', { jobId: 'job-1', etaSeconds: 10, percent: 0, stage: 'queued' });

  assert.equal(jobProgress.get('job-1'), 42.5, 'speed/eta nao devem regredir o percentual');
});
