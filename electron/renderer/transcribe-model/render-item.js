/**
 * Renderização de um item da lista de modelos.
 */

import { formatBytes } from '../shared.js';
import { labelOf } from './state.js';

export function renderItem(state, helpers, status) {
  const { makeBadge, stateText } = helpers;

  const item = document.createElement('li');
  item.className = 'transcribe-model-item';
  item.dataset.model = status.model;
  if (status.model === state.selectedModel) item.classList.add('is-selected');
  if (status.model === state.downloadingModel) item.classList.add('is-downloading');

  const head = document.createElement('div');
  head.className = 'transcribe-model-head';

  const name = document.createElement('strong');
  name.textContent = status.label || status.model;
  head.appendChild(name);

  if (status.heavy) head.appendChild(makeBadge('Pesado', 'warn'));
  if (status.model === state.selectedModel) head.appendChild(makeBadge('Em uso', 'accent'));
  else if (status.model === state.defaultModel && status.installed) head.appendChild(makeBadge('Padrão'));

  const size = document.createElement('span');
  size.className = 'transcribe-model-size';
  size.textContent = `~${formatBytes(status.expectedSize)}`;
  head.appendChild(size);
  item.appendChild(head);

  if (status.note) {
    const note = document.createElement('p');
    note.className = 'hint-line transcribe-model-note';
    note.textContent = status.note;
    item.appendChild(note);
  }

  const stateEl = document.createElement('p');
  stateEl.className = 'hint-line transcribe-model-state';
  stateEl.textContent = stateText(status);
  item.appendChild(stateEl);

  item.appendChild(renderProgressBar(state, status));
  item.appendChild(renderActions(state, helpers, status));

  return item;
}

/** Barra de progresso: visível só durante o download deste modelo. */
function renderProgressBar(state, status) {
  const progress = document.createElement('div');
  progress.className = 'transcribe-progress';
  progress.hidden = status.model !== state.downloadingModel;
  const barWrap = document.createElement('div');
  barWrap.className = 'transcribe-progress-bar';
  const bar = document.createElement('span');
  bar.style.width = '0%';
  barWrap.appendChild(bar);
  const label = document.createElement('span');
  label.className = 'transcribe-progress-label';
  label.textContent = '0%';
  progress.appendChild(barWrap);
  progress.appendChild(label);
  return progress;
}

/** Botões de baixar/usar/excluir conforme o estado do modelo. */
function renderActions(state, helpers, status) {
  const { makeButton } = helpers;
  const actions = document.createElement('div');
  actions.className = 'transcribe-model-actions';

  if (status.model === state.downloadingModel) {
    actions.appendChild(makeButton('Cancelar download', 'cancel'));
  } else if (!status.installed) {
    const btn = makeButton(status.partialSize > 0 ? 'Retomar download' : 'Baixar', 'download');
    if (state.downloadingModel) {
      btn.disabled = true;
      btn.title = `Aguarde o download de "${labelOf(state, state.downloadingModel)}".`;
    }
    actions.appendChild(btn);
  }

  if (status.installed && status.model !== state.selectedModel) {
    actions.appendChild(makeButton('Usar este', 'use'));
  }

  if (status.installed || status.partialSize > 0) {
    if (state.pendingDelete === status.model) {
      actions.appendChild(makeButton('Confirmar exclusão', 'delete-confirm', 'button button-primary'));
      actions.appendChild(makeButton('Cancelar', 'delete-cancel'));
    } else {
      const btn = makeButton('Excluir', 'delete');
      if (state.downloadingModel === status.model) btn.disabled = true;
      actions.appendChild(btn);
    }
  }

  return actions;
}
