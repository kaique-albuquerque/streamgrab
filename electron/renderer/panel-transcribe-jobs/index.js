/**
 * Renderização da lista de jobs de transcrição.
 *
 * As ações dos itens (cancelar/repetir/abrir) são delegadas via `onJobAction`
 * — este módulo só constrói o DOM.
 */

import { describeJob } from './head.js';
import { clampPercent } from './details.js';
import { renderJobItem } from './item.js';

export function createJobListRenderer({ onJobAction }) {
  function renderList(jobs) {
    const listEl = document.getElementById('transcribeList');
    const emptyEl = document.getElementById('transcribeEmpty');
    if (!listEl) return;

    const items = [...jobs.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.hidden = items.length > 0;

    for (const job of items) listEl.appendChild(renderJobItem(job, onJobAction));
  }

  /** Atualização leve de um item em execução (sem re-render da lista).
   *  Retorna false se o item não está no DOM (caller deve re-renderizar). */
  function updateJobItemDom(job) {
    const listEl = document.getElementById('transcribeList');
    if (!listEl) return false;
    const item = listEl.querySelector(`[data-job-id="${job.jobId}"]`);
    if (!item) return false;
    const percent = clampPercent(job.percent);
    const fill = item.querySelector('.transcribe-progress-bar span');
    if (fill) fill.style.width = `${percent}%`;
    const label = item.querySelector('.transcribe-progress-label');
    if (label) label.textContent = `${percent}%`;
    const sub = item.querySelector('.queue-item-url');
    if (sub) sub.textContent = describeJob(job);
    return true;
  }

  return { renderList, updateJobItemDom };
}
