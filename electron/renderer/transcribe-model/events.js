/**
 * Handlers de eventos da lista e do <select> de modelos.
 */

import { LIST_ID, SELECT_ID, labelOf } from './state.js';

export function createEvents(ctx) {
  const { state, helpers, render, actions } = ctx;
  const { hint } = helpers;

  function onListClick(event) {
    const btn = event.target.closest('button[data-action]');
    if (!btn || btn.disabled) return;

    const model = btn.closest('[data-model]')?.dataset.model;
    if (!model) return;

    switch (btn.dataset.action) {
      case 'download':
        actions.download(model).catch(() => {});
        break;
      case 'cancel':
        actions.cancelDownload().catch(() => {});
        break;
      case 'use':
        actions.useModel(model).catch(() => {});
        break;
      case 'delete':
        state.pendingDelete = model;
        hint(`Excluir "${labelOf(state, model)}"? O arquivo será apagado do disco e baixado de novo se precisar.`);
        render.renderList();
        break;
      case 'delete-confirm':
        actions.removeModel(model).catch(() => {});
        break;
      case 'delete-cancel':
        state.pendingDelete = null;
        hint('');
        render.renderList();
        break;
    }
  }

  function onSelectChange(event) {
    const model = event.target.value;
    if (!state.models.has(model)) return;
    actions.useModel(model).catch(() => {});
  }

  function bind() {
    if (state.wired) return;
    state.wired = true;
    document.getElementById(LIST_ID)?.addEventListener('click', onListClick);
    document.getElementById(SELECT_ID)?.addEventListener('change', onSelectChange);
  }

  return { bind };
}
