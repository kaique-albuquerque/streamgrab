/**
 * panel-transcribe-jobs.js — Renderização da lista de jobs de transcrição.
 *
 * Separado de panel-transcribe.js para manter funções pequenas.
 * Ações dos itens (cancelar/repetir/abrir) são delegadas via `onJobAction`
 * — este módulo só constrói o DOM.
 */

import { TRANSCRIBE_STATE_LABELS, TRANSCRIBE_STAGE_LABELS } from './panel-constants.js';
import { formatBytes } from './shared.js';

export function createJobListRenderer({ onJobAction }) {
  function renderList(jobs) {
    const listEl = document.getElementById('transcribeList');
    const emptyEl = document.getElementById('transcribeEmpty');
    if (!listEl) return;

    const items = [...jobs.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.hidden = items.length > 0;

    for (const job of items) listEl.appendChild(renderJobItem(job));
  }

  function renderJobItem(job) {
    const item = document.createElement('div');
    item.className = 'queue-item';
    item.dataset.jobId = job.jobId;
    item.appendChild(renderHead(job));

    if (job.status === 'running') item.appendChild(renderProgress(job));
    if (job.status === 'error' && job.error) item.appendChild(renderError(job));
    if (job.status === 'done' && Array.isArray(job.files) && job.files.length > 0) {
      item.appendChild(renderFiles(job));
    }

    const actions = renderActions(job);
    if (actions) item.appendChild(actions);
    return item;
  }

  function renderHead(job) {
    const head = document.createElement('div');
    head.className = 'queue-item-head';

    const titleWrap = document.createElement('div');
    titleWrap.style.minWidth = '0';
    const title = document.createElement('div');
    title.className = 'queue-item-title';
    title.textContent = job.videoPath?.split(/[\\/]/).pop() || job.videoPath || 'Vídeo';

    const sub = document.createElement('div');
    sub.className = 'queue-item-url';
    sub.textContent = describeJob(job);

    titleWrap.append(title, sub);

    const statePill = document.createElement('span');
    statePill.className = 'job-state';
    statePill.dataset.state = job.status || 'queued';
    statePill.textContent = TRANSCRIBE_STATE_LABELS[job.status] || job.status || '';

    head.append(titleWrap, statePill);
    return head;
  }

  function describeJob(job) {
    const stageLabel = job.status === 'running' ? TRANSCRIBE_STAGE_LABELS[job.stage] || job.stage || '' : '';
    const formats = (job.formats || []).map((f) => `.${f}`).join(' ');
    return `${job.language || 'pt'} · ${formats}${stageLabel ? ` · ${stageLabel}` : ''}`;
  }

  function renderProgress(job) {
    const wrap = document.createElement('div');
    wrap.className = 'transcribe-progress';

    const bar = document.createElement('div');
    bar.className = 'transcribe-progress-bar';
    const fill = document.createElement('span');
    fill.style.width = `${clampPercent(job.percent)}%`;
    bar.appendChild(fill);

    const label = document.createElement('span');
    label.className = 'transcribe-progress-label';
    label.textContent = `${clampPercent(job.percent)}%`;

    wrap.append(bar, label);
    return wrap;
  }

  function renderError(job) {
    const err = document.createElement('div');
    err.className = 'transcribe-error-detail';
    err.textContent = job.error;
    return err;
  }

  function renderFiles(job) {
    const wrap = document.createElement('div');
    wrap.className = 'transcribe-files';
    for (const file of job.files) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'transcribe-file-chip';
      chip.textContent = `${file.format.toUpperCase()} · ${formatBytes(file.size || 0)}`;
      chip.title = `Abrir ${file.path}`;
      chip.addEventListener('click', () => onJobAction?.('open-file', file));
      wrap.appendChild(chip);
    }
    return wrap;
  }

  function renderActions(job) {
    const actions = document.createElement('div');
    actions.className = 'queue-item-actions';

    if (job.status === 'running' || job.status === 'queued') {
      appendActionBtn(actions, 'Cancelar', () => onJobAction?.('cancel', job));
    }
    if (job.status === 'error' || job.status === 'cancelled') {
      appendActionBtn(actions, 'Repetir', () => onJobAction?.('retry', job));
    }
    if (job.status === 'done' && job.files?.[0]?.path) {
      appendActionBtn(actions, 'Mostrar na pasta', () => onJobAction?.('reveal', job));
    }
    if (['done', 'error', 'cancelled'].includes(job.status)) {
      appendActionBtn(actions, 'Remover', () => onJobAction?.('remove', job));
    }

    return actions.childElementCount > 0 ? actions : null;
  }

  function appendActionBtn(actions, label, fn) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'button button-ghost';
    btn.textContent = label;
    btn.addEventListener('click', () => fn?.());
    actions.appendChild(btn);
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

  function clampPercent(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
  }

  return { renderList, updateJobItemDom };
}
