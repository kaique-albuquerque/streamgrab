/**
 * panel-transcribe-model.js — Catálogo de modelos Whisper na aba Transcrição.
 *
 * O catálogo (nomes, tamanhos, URLs e verificação de integridade) vive no
 * main process (src/transcribe/model-manager.js). Este módulo apenas lista os
 * modelos, reflete status/progresso e dispara download/exclusão via preload —
 * o renderer nunca escolhe caminho nem URL, apenas o id do modelo.
 */

import { formatBytes } from './shared.js';

const LIST_ID = 'transcribeModelList';
const SELECT_ID = 'transcribeModelSelect';
const HINT_ID = 'transcribeModelsHint';

export function createModelSection() {
  /** model → status devolvido pelo main process. */
  let models = new Map();
  let defaultModel = 'small';
  let selectedModel = 'small';
  let downloadingModel = null;
  /** Modelo aguardando confirmação de exclusão (confirmação inline). */
  let pendingDelete = null;
  let wired = false;

  // ------------------------------------------------------------- utilidades

  function hint(text, isError = false) {
    const el = document.getElementById(HINT_ID);
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? 'var(--danger)' : '';
  }

  function labelOf(model) {
    return models.get(model)?.label || model;
  }

  function statusOf(model) {
    return models.get(model) || null;
  }

  function stateText(status) {
    if (status.model === downloadingModel) return 'Baixando...';
    if (status.installed) return `Instalado (${formatBytes(status.size)})`;
    if (status.partialSize > 0) {
      return `Download incompleto (${formatBytes(status.partialSize)} de ~${formatBytes(status.expectedSize)}) — pode retomar`;
    }
    return `Não baixado (~${formatBytes(status.expectedSize)})`;
  }

  function makeBadge(text, kind = '') {
    const span = document.createElement('span');
    span.className = `transcribe-model-badge${kind ? ` transcribe-model-badge-${kind}` : ''}`;
    span.textContent = text;
    return span;
  }

  function makeButton(text, action, className = 'button button-ghost') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.dataset.action = action;
    btn.textContent = text;
    return btn;
  }

  // ------------------------------------------------------------ renderização

  function renderList() {
    const listEl = document.getElementById(LIST_ID);
    if (!listEl) return;
    listEl.textContent = '';
    for (const status of models.values()) listEl.appendChild(renderItem(status));
    renderSelect();
  }

  function renderItem(status) {
    const item = document.createElement('li');
    item.className = 'transcribe-model-item';
    item.dataset.model = status.model;
    if (status.model === selectedModel) item.classList.add('is-selected');
    if (status.model === downloadingModel) item.classList.add('is-downloading');

    const head = document.createElement('div');
    head.className = 'transcribe-model-head';

    const name = document.createElement('strong');
    name.textContent = status.label || status.model;
    head.appendChild(name);

    if (status.heavy) head.appendChild(makeBadge('Pesado', 'warn'));
    if (status.model === selectedModel) head.appendChild(makeBadge('Em uso', 'accent'));
    else if (status.model === defaultModel && status.installed) head.appendChild(makeBadge('Padrão'));

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

    const state = document.createElement('p');
    state.className = 'hint-line transcribe-model-state';
    state.textContent = stateText(status);
    item.appendChild(state);

    // Barra de progresso: visível só durante o download deste modelo.
    const progress = document.createElement('div');
    progress.className = 'transcribe-progress';
    progress.hidden = status.model !== downloadingModel;
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
    item.appendChild(progress);

    const actions = document.createElement('div');
    actions.className = 'transcribe-model-actions';

    if (status.model === downloadingModel) {
      actions.appendChild(makeButton('Cancelar download', 'cancel'));
    } else if (!status.installed) {
      const btn = makeButton(status.partialSize > 0 ? 'Retomar download' : 'Baixar', 'download');
      if (downloadingModel) {
        btn.disabled = true;
        btn.title = `Aguarde o download de "${labelOf(downloadingModel)}".`;
      }
      actions.appendChild(btn);
    }

    if (status.installed && status.model !== selectedModel) {
      actions.appendChild(makeButton('Usar este', 'use'));
    }

    if (status.installed || status.partialSize > 0) {
      if (pendingDelete === status.model) {
        actions.appendChild(makeButton('Confirmar exclusão', 'delete-confirm', 'button button-primary'));
        actions.appendChild(makeButton('Cancelar', 'delete-cancel'));
      } else {
        const btn = makeButton('Excluir', 'delete');
        if (downloadingModel === status.model) btn.disabled = true;
        actions.appendChild(btn);
      }
    }

    item.appendChild(actions);
    return item;
  }

  /** Preenche o <select> de "Nova transcrição" a partir dos modelos conhecidos. */
  function renderSelect() {
    const select = document.getElementById(SELECT_ID);
    if (!select) return;

    select.textContent = '';
    for (const status of models.values()) {
      const option = document.createElement('option');
      option.value = status.model;
      option.textContent = status.installed ? status.label : `${status.label} — não baixado`;
      select.appendChild(option);
    }
    select.disabled = models.size === 0;
    select.value = models.has(selectedModel) ? selectedModel : defaultModel;
  }

  // ------------------------------------------------------------------ ações

  async function refreshModels() {
    const res = await window.api.transcribeModels();
    if (!res?.ok) {
      hint(res?.error?.message || 'Falha ao carregar os modelos Whisper.', true);
      return;
    }

    defaultModel = res.defaultModel || 'small';
    selectedModel = res.selectedModel || defaultModel;
    downloadingModel = res.downloading || null;
    models = new Map((res.models || []).map((status) => [status.model, status]));
    renderList();
  }

  async function download(model) {
    downloadingModel = model;
    pendingDelete = null;
    hint(`Baixando "${labelOf(model)}"... você pode cancelar e retomar depois.`);
    renderList();

    try {
      const res = await window.api.transcribeModelDownload({ model });
      if (res?.cancelled) hint('Download cancelado. O progresso parcial foi mantido.');
      else if (!res?.ok) hint(res?.error?.message || 'Falha no download do modelo.', true);
      else hint('');
    } catch (err) {
      hint(err?.message || 'Falha no download do modelo.', true);
    } finally {
      downloadingModel = null;
      await refreshModels().catch(() => {});
    }
  }

  async function cancelDownload() {
    await window.api.transcribeModelCancel().catch(() => {});
  }

  async function removeModel(model) {
    pendingDelete = null;
    const res = await window.api.transcribeModelDelete({ model });
    if (!res?.ok) {
      hint(res?.error?.message || 'Falha ao excluir o modelo.', true);
      renderList();
      return;
    }

    if (res.selectionReset) {
      selectedModel = res.selectedModel || defaultModel;
      hint(`"${labelOf(model)}" era o modelo em uso. O padrão "${labelOf(selectedModel)}" foi reativado.`);
    } else {
      hint('');
    }
    await refreshModels().catch(() => {});
  }

  async function useModel(model) {
    selectedModel = model;
    pendingDelete = null;
    renderList();
    await window.api.settingsUpdate({ transcribeModel: model }).catch(() => {});
  }

  // ---------------------------------------------------------------- eventos

  function onListClick(event) {
    const btn = event.target.closest('button[data-action]');
    if (!btn || btn.disabled) return;

    const model = btn.closest('[data-model]')?.dataset.model;
    if (!model) return;

    switch (btn.dataset.action) {
      case 'download':
        download(model).catch(() => {});
        break;
      case 'cancel':
        cancelDownload().catch(() => {});
        break;
      case 'use':
        useModel(model).catch(() => {});
        break;
      case 'delete':
        pendingDelete = model;
        hint(`Excluir "${labelOf(model)}"? O arquivo será apagado do disco e baixado de novo se precisar.`);
        renderList();
        break;
      case 'delete-confirm':
        removeModel(model).catch(() => {});
        break;
      case 'delete-cancel':
        pendingDelete = null;
        hint('');
        renderList();
        break;
    }
  }

  function onSelectChange(event) {
    const model = event.target.value;
    if (!models.has(model)) return;
    useModel(model).catch(() => {});
  }

  /** Progresso de download broadcast pelo main process (só do modelo ativo). */
  function renderModelProgress(data = {}) {
    const model = data.model;
    if (!model || model !== downloadingModel) return;

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

  function bind() {
    if (wired) return;
    wired = true;
    document.getElementById(LIST_ID)?.addEventListener('click', onListClick);
    document.getElementById(SELECT_ID)?.addEventListener('change', onSelectChange);
  }

  return {
    bind,
    refreshModels,
    renderModelProgress,
    getSelectedModel: () => selectedModel,
    isModelInstalled: (model) => Boolean(statusOf(model)?.installed),
  };
}
