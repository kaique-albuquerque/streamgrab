/**
 * Video Tab — Dispatch de eventos da fila.
 *
 * findTabForJob: localiza a aba correspondente a um payload.
 * handleQueueEvent: roteador de eventos (started, progress, speed, eta, etc.).
 */

import {
  appendLog,
  formatDuration,
  formatKbps,
  markAllPreviousAsDone,
  setActiveStep,
  setStatus,
  syncMetrics,
} from './shared.js';
import { applyProgress, finishTabDownload, failTabDownload, cancelTabDownload } from './video-tab-progress.js';

/** Eventos cujo payload carrega `percent` valido (speed/eta trazem 0 default). */
const PROGRESS_EVENTS = new Set(['start', 'progress']);

export function findTabForJob(appState, payload) {
  if (!payload) return null;
  if (payload.taskId) {
    const byTask = appState.tabs.get(payload.taskId);
    if (byTask) return byTask;
  }
  // `started` carrega o job serializado (`id`/`meta`), nao o `jobId` dos
  // eventos de progresso — sem isso a aba nao era encontrada no inicio.
  if (payload.id) {
    for (const tab of appState.tabs.values()) {
      if (tab.jobId === payload.id || tab.taskId === payload.meta?.taskId) return tab;
    }
  }
  if (payload.meta?.taskId) {
    const byMetaTask = appState.tabs.get(payload.meta.taskId);
    if (byMetaTask) return byMetaTask;
  }
  if (payload.jobId) {
    for (const tab of appState.tabs.values()) {
      if (tab.jobId === payload.jobId) return tab;
    }
  }
  return null;
}

export function createQueueEventHandler({ appState, jobProgress, onQueueRefresh, onHistoryRefresh }) {
  /** A aba exibe progresso apenas quando o download foi iniciado por ela. */
  function ownsJob(tab) {
    return Boolean(tab) && tab.busy;
  }

  function handleQueueEvent(event, payload) {
    payload = payload || {};
    const tab = findTabForJob(appState, payload);

    // Apenas eventos que realmente carregam progresso. `speed`/`eta` vem de
    // `createProgressPayload`, que preenche `percent: 0` por default — gravar
    // esse 0 zeraria o progresso real consumido pelo painel da Fila.
    if (PROGRESS_EVENTS.has(event) && payload.jobId) {
      const percent = Number(payload.percent);
      if (Number.isFinite(percent)) jobProgress.set(payload.jobId, percent);
    }

    switch (event) {
      case 'started':
        if (tab) {
          tab.jobId = payload.id || payload.jobId || tab.jobId;
          tab.jobState = 'active';
          if (tab.busy) {
            tab.panel.classList.add('downloading');
            setActiveStep(tab, 'download');
            markAllPreviousAsDone(tab, 'download');
            setStatus(tab, payload.message || 'Baixando...');
          }
        }
        break;
      case 'start':
      case 'progress':
        if (ownsJob(tab)) {
          tab.panel.classList.add('downloading');
          applyProgress(tab, payload);
        }
        break;
      case 'speed':
        if (ownsJob(tab) && payload.speed != null && payload.speed !== '') {
          tab.metrics.speed = formatKbps(Number(payload.speed) * 8) || 'N/A';
          syncMetrics(tab);
        }
        break;
      case 'eta':
        if (ownsJob(tab) && payload.etaSeconds != null) {
          tab.metrics.time = formatDuration(payload.etaSeconds);
          syncMetrics(tab);
        }
        break;
      case 'log':
        if (tab && payload.message) appendLog(tab, payload.message);
        break;
      case 'pause':
        if (tab) {
          tab.jobState = 'paused';
          if (tab.busy) {
            tab.panel.classList.remove('downloading');
            setStatus(tab, 'Pausado. Retome pela Fila ou pelo botao da aba.');
            appendLog(tab, 'Download pausado.');
          }
        }
        break;
      case 'resume':
        if (tab) {
          tab.jobState = 'active';
          if (tab.busy) {
            tab.panel.classList.add('downloading');
            setStatus(tab, 'Retomando download...');
            appendLog(tab, 'Download retomado.');
          }
        }
        break;
      case 'complete':
        if (tab) finishTabDownload(tab, payload, appState.activeOutputs);
        break;
      case 'error':
        if (tab) failTabDownload(tab, payload, appState.activeOutputs);
        break;
      case 'cancel':
        if (tab) cancelTabDownload(tab, payload, appState.activeOutputs);
        break;
      default:
        break;
    }

    onQueueRefresh();
    if (event === 'complete' || event === 'error' || event === 'cancel') {
      onHistoryRefresh();
    }
  }

  return { handleQueueEvent };
}
