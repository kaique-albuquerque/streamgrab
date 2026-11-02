/**
 * RenderizaÃ§Ã£o da lista de jobs de transcriÃ§Ã£o.
 *
 * As aÃ§Ãµes dos itens (cancelar/repetir/abrir) sÃ£o delegadas via `onJobAction`
 * â€” este mÃ³dulo sÃ³ constrÃ³i o DOM.
 */

import { describeJob } from './head.js';
import { clampPercent } from './details.js';
import { renderJobItem } from './item.js';
import { TRANSCRIBE_STATE_LABELS } from '../panel-constants.js';

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

  /**
   * AtualizaÃ§Ã£o leve de um item (sem re-render da lista).
   *
   * Retorna false quando o item precisa ser re-renderizado: nÃ£o estÃ¡ no DOM ou
   * ainda nÃ£o tem a barra de progresso exigida pelo status atual (o progresso
   * chega logo depois de o job virar 'running').
   */
  function updateJobItemDom(job) {
    const listEl = document.getElementById('transcribeList');
    if (!listEl) return false;
    const item = listEl.querySelector(`[data-job-id="${job.jobId}"]`);
    if (!item) return false;

    const fill = item.querySelector('.transcribe-progress-bar span');
    if (!fill && job.status === 'running') return false;

    const percent = clampPercent(job.percent);
    if (fill) fill.style.width = `${percent}%`;
    const label = item.querySelector('.transcribe-progress-label');
    if (label) label.textContent = `${percent}%`;
    const sub = item.querySelector('.queue-item-url');
    if (sub) sub.textContent = describeJob(job);

    // O pill de estado tambÃ©m Ã© sincronizado aqui: os eventos de progresso
    // podem chegar antes do re-render que traria o status novo.
    const pill = item.querySelector('.job-state');
    if (pill) {
      pill.textContent = TRANSCRIBE_STATE_LABELS[job.status] || job.status || '';
      pill.dataset.state = job.status || 'queued';
    }
    return true;
  }

  return { renderList, updateJobItemDom };
}
