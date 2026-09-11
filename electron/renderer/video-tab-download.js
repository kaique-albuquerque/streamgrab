/**
 * Video Tab — Orquestrador do workflow de download.
 *
 * Coordena enfileiramento, progresso, lifecycle e dispatch de eventos.
 * Módulos dedicados:
 *  - video-tab-progress.js  → applyProgress, finish/fail/cancelTabDownload
 *  - video-tab-enqueue.js   → enqueueForTab
 *  - video-tab-events.js    → findTabForJob, createQueueEventHandler
 */

import { enqueueForTab as _enqueueForTab } from './video-tab-enqueue.js';
import { cancelTabDownload as _cancelTabDownload } from './video-tab-progress.js';
import { createQueueEventHandler } from './video-tab-events.js';

export function createDownloadHandlers({ appState, onQueueRefresh, onHistoryRefresh }) {
  const jobProgress = new Map();
  const { handleQueueEvent } = createQueueEventHandler({ appState, jobProgress, onQueueRefresh, onHistoryRefresh });

  function enqueueForTab(state, opts) {
    return _enqueueForTab(state, { appState, onQueueRefresh, lockNow: opts.lockNow });
  }

  function cancelTabDownload(tab, payload) {
    return _cancelTabDownload(tab, payload, appState.activeOutputs);
  }

  return { enqueueForTab, cancelTabDownload, handleQueueEvent, jobProgress };
}
