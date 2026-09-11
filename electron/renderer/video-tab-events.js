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

export function findTabForJob(appState, payload) {
  if (!payload) return null;
  if (payload.taskId) {
    const byTask = appState.tabs.get(payload.taskId);
    if (byTask) return byTask;
  }
  if (payload.jobId) {
    for (const tab of appState.tabs.values()) {
      if (tab.jobId === payload.jobId) return tab;
    }
  }
  return null;
}

export function createQueueEventHandler({ appState, jobProgress, onQueueRefresh, onHistoryRefresh }) {
  function handleQueueEvent(event, payload) {
    payload = payload || {};
    const tab = findTabForJob(appState, payload);

    if (payload.jobId && typeof payload.percent === 'number') {
      jobProgress.set(payload.jobId, payload.percent);
    }

    switch (event) {
      case 'started':
        if (tab) {
          tab.jobId = payload.jobId || tab.jobId;
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
        if (tab && tab.busy) applyProgress(tab, payload);
        break;
      case 'speed':
        if (tab && tab.busy && payload.speed != null && payload.speed !== '') {
          tab.metrics.speed = formatKbps(Number(payload.speed) * 8) || 'N/A';
          syncMetrics(tab);
        }
        break;
      case 'eta':
        if (tab && tab.busy && payload.etaSeconds != null) {
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
