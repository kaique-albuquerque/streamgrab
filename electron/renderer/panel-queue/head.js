/**
 * Fila — cabeçalho e metadados de um item da lista.
 */

import { formatBytes } from '../shared.js';
import { QUEUE_STATE_LABELS } from '../panel-constants.js';

/** Monta o cabeçalho do item (título, URL de origem e pill de estado). */
export function renderQueueHead(job, state) {
  const head = document.createElement('div');
  head.className = 'queue-item-head';

  const titleWrap = document.createElement('div');
  titleWrap.style.minWidth = '0';

  const title = document.createElement('div');
  title.className = 'queue-item-title';
  title.textContent = job.meta?.filename || job.title || 'Download';

  const sub = document.createElement('div');
  sub.className = 'queue-item-url';
  sub.textContent = job.meta?.sourceUrl || job.url || '';

  titleWrap.append(title, sub);

  const statePill = document.createElement('span');
  statePill.className = 'job-state';
  statePill.dataset.state = state;
  statePill.textContent = QUEUE_STATE_LABELS[state] || state;

  head.append(titleWrap, statePill);
  return head;
}

/** Monta a linha de metadados (id, progresso, tamanho, erro). */
export function renderQueueMeta(job, { state, terminal, percent, totalBytes }) {
  const meta = document.createElement('div');
  meta.className = 'queue-item-meta';

  const bits = [`id: ${job.id}`];
  if (!terminal) bits.push(`${Math.floor(percent)}%`);
  if (totalBytes > 0) bits.push(formatBytes(totalBytes));
  if (state === 'failed' && job.error?.message) bits.push(job.error.message);

  meta.textContent = bits.join(' · ');
  return meta;
}
