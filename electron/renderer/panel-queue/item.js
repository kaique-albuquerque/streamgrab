/**
 * Fila — composição de um item da lista de jobs.
 */

import { TERMINAL_STATES } from '../panel-constants.js';
import { renderQueueHead, renderQueueMeta } from './head.js';
import { renderMiniProgress } from './progress.js';
import { renderQueueActions } from './actions.js';

/** Monta o elemento completo de um job da fila. */
export function renderQueueItem({ job, percent, refresh }) {
  const item = document.createElement('div');
  item.className = 'queue-item';
  item.dataset.jobId = job.id;

  const state = job.state;
  const terminal = TERMINAL_STATES.has(state);
  const totalBytes = Number(job.meta?.totalBytes) || 0;

  item.appendChild(renderQueueHead(job, state));
  item.appendChild(renderQueueMeta(job, { state, terminal, percent, totalBytes }));

  if (!terminal && state !== 'paused' && percent > 0) {
    item.appendChild(renderMiniProgress(percent));
  }

  item.appendChild(renderQueueActions({ job, state, terminal, refresh }));
  return item;
}
