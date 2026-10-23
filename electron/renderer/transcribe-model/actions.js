/**
 * Ações da seção de modelos: refresh, download, cancelar, excluir e usar.
 */

import { labelOf } from './state.js';

export function createActions(ctx) {
  const { state, helpers, render, api } = ctx;
  const { hint } = helpers;

  async function refreshModels() {
    const res = await api().transcribeModels();
    if (!res?.ok) {
      hint(res?.error?.message || 'Falha ao carregar os modelos Whisper.', true);
      return;
    }

    state.defaultModel = res.defaultModel || 'small';
    state.selectedModel = res.selectedModel || state.defaultModel;
    state.downloadingModel = res.downloading || null;
    state.models = new Map((res.models || []).map((status) => [status.model, status]));
    render.renderList();
  }

  async function download(model) {
    state.downloadingModel = model;
    state.pendingDelete = null;
    hint(`Baixando "${labelOf(state, model)}"... você pode cancelar e retomar depois.`);
    render.renderList();

    try {
      const res = await api().transcribeModelDownload({ model });
      if (res?.cancelled) hint('Download cancelado. O progresso parcial foi mantido.');
      else if (!res?.ok) hint(res?.error?.message || 'Falha no download do modelo.', true);
      else hint('');
    } catch (err) {
      hint(err?.message || 'Falha no download do modelo.', true);
    } finally {
      state.downloadingModel = null;
      await refreshModels().catch(() => {});
    }
  }

  async function cancelDownload() {
    await api().transcribeModelCancel().catch(() => {});
  }

  async function removeModel(model) {
    state.pendingDelete = null;
    const res = await api().transcribeModelDelete({ model });
    if (!res?.ok) {
      hint(res?.error?.message || 'Falha ao excluir o modelo.', true);
      render.renderList();
      return;
    }

    if (res.selectionReset) {
      state.selectedModel = res.selectedModel || state.defaultModel;
      hint(`"${labelOf(state, model)}" era o modelo em uso. O padrão "${labelOf(state, state.selectedModel)}" foi reativado.`);
    } else {
      hint('');
    }
    await refreshModels().catch(() => {});
  }

  async function useModel(model) {
    state.selectedModel = model;
    state.pendingDelete = null;
    render.renderList();
    await api().settingsUpdate({ transcribeModel: model }).catch(() => {});
  }

  return { refreshModels, download, cancelDownload, removeModel, useModel };
}
