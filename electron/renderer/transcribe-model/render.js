/**
 * Renderização da lista, do <select> e do progresso de download.
 */

import { formatBytes } from '../shared.js';
import { LIST_ID, SELECT_ID } from './state.js';
import { renderItem } from './render-item.js';

export function createRenderer(ctx) {
  const { state, helpers } = ctx;

  function renderList() {
    const listEl = document.getElementById(LIST_ID);
    if (!listEl) return;
    listEl.textContent = '';
    for (const status of state.models.values()) listEl.appendChild(renderItem(state, helpers, status));
    renderSelect();
  }

  /** Preenche o <select> de "Nova transcrição" a partir dos modelos conhecidos. */
  function renderSelect() {
    const select = document.getElementById(SELECT_ID);
    if (!select) return;

    select.textContent = '';
    for (const status of state.models.values()) {
      const option = document.createElement('option');
      option.value = status.model;
      option.textContent = status.installed ? status.label : `${status.label} — não baixado`;
      select.appendChild(option);
    }
    select.disabled = state.models.size === 0;
    select.value = state.models.has(state.selectedModel) ? state.selectedModel : state.defaultModel;
  }

  /** Progresso de download broadcast pelo main process (só do modelo ativo). */
  function renderModelProgress(data = {}) {
    const model = data.model;
    if (!model || model !== state.downloadingModel) return;

    const listEl = document.getElementById(LIST_ID);
    const item = listEl && Array.from(listEl.children).find((el) => el.dataset.model === model);
    if (!item) return;

    const stateEl = item.querySelector('.transcribe-model-state');
    const progressEl = item.querySelector('.transcribe-progress');
    const barEl = item.querySelector('.transcribe-progress-bar > span');
    const labelEl = item.querySelector('.transcribe-progress-label');
    const pct = Math.max(0, Math.min(100, Number(data.percent) || 0));

    if (data.stage === 'done') {
      if (progressEl) progressEl.hidden = true;
      if (stateEl) stateEl.textContent = 'Instalado — verificando integridade...';
      return;
    }

    if (progressEl) progressEl.hidden = false;
    if (barEl) barEl.style.width = `${pct}%`;
    if (labelEl) labelEl.textContent = `${pct}%`;
    if (stateEl && data.total > 0) {
      stateEl.textContent = `Baixando... ${pct}% (${formatBytes(data.downloaded)} de ${formatBytes(data.total)})`;
    }
  }

  return { renderList, renderSelect, renderModelProgress };
}
