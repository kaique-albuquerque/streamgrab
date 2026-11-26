/**
 * Item da lista de jobs de tradução.
 *
 * Monta o DOM de um job: título, estado, barra de progresso (quando running),
 * erro (quando error) e ações (cancelar / repetir / remover).
 */

import { TRANSLATE_STATE_LABELS, TRANSLATE_STAGE_LABELS } from '../panel-constants.js';

/** Normaliza o percentual para 0..100. */
export function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

/** Linha de título + estado. */
function renderHead(job, doc) {
  const head = doc.createElement('div');
  head.className = 'queue-item-head';

  const wrap = doc.createElement('div');
  wrap.style.minWidth = '0';
  const title = doc.createElement('div');
  title.className = 'queue-item-title';
  title.textContent = job.srtPath?.split(/[\\/]/).pop() || job.srtPath || 'Legenda';
  const sub = doc.createElement('div');
  sub.className = 'queue-item-url';
  const stage = job.status === 'running' ? TRANSLATE_STAGE_LABELS[job.stage] || job.stage || '' : '';
  sub.textContent = stage || '';
  wrap.append(title, sub);

  const pill = doc.createElement('span');
  pill.className = 'job-state';
  pill.dataset.state = job.status || 'queued';
  pill.textContent = TRANSLATE_STATE_LABELS[job.status] || job.status || '';

  head.append(wrap, pill);
  return head;
}

/** Barra de progresso. */
function renderProgress(job, doc) {
  const wrap = doc.createElement('div');
  wrap.className = 'transcribe-progress';
  const bar = doc.createElement('div');
  bar.className = 'transcribe-progress-bar';
  const fill = doc.createElement('span');
  fill.style.width = `${clampPercent(job.percent)}%`;
  bar.appendChild(fill);
  const label = doc.createElement('span');
  label.className = 'transcribe-progress-label';
  label.textContent = `${clampPercent(job.percent)}%`;
  wrap.append(bar, label);
  return wrap;
}

/** Mensagem de erro. */
function renderError(job, doc) {
  const el = doc.createElement('div');
  el.className = 'transcribe-error-detail';
  el.textContent = job.error;
  return el;
}

/** Botões de ação. */
function renderActions(job, onAction, doc) {
  const actions = doc.createElement('div');
  actions.className = 'queue-item-actions';

  const add = (label, action) => {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'button button-ghost';
    btn.textContent = label;
    btn.dataset.action = action;
    btn.addEventListener('click', () => onAction?.(action, job));
    actions.appendChild(btn);
  };

  if (job.status === 'running' || job.status === 'queued') add('Cancelar', 'cancel');
  if (job.status === 'error' || job.status === 'cancelled') add('Repetir', 'retry');
  if (['done', 'error', 'cancelled'].includes(job.status)) add('Remover', 'remove');

  return actions.childElementCount > 0 ? actions : null;
}

/** Monta o item completo de um job. */
export function renderTranslateItem(job, onAction, doc) {
  const item = doc.createElement('div');
  item.className = 'queue-item';
  item.dataset.jobId = job.jobId;
  item.appendChild(renderHead(job, doc));
  if (job.status === 'running') item.appendChild(renderProgress(job, doc));
  if (job.status === 'error' && job.error) item.appendChild(renderError(job, doc));
  const actions = renderActions(job, onAction, doc);
  if (actions) item.appendChild(actions);
  return item;
}