/**
 * Card individual do histórico com as ações por entrada.
 */

import { formatBytes, formatDate } from '../shared.js';
import { QUEUE_STATE_LABELS } from '../panel-constants.js';

export function renderHistoryItem(entry, { onRefresh, onRefreshBoth }) {
  const item = document.createElement('div');
  item.className = 'queue-item';
  const head = document.createElement('div');
  head.className = 'queue-item-head';
  const titleWrap = document.createElement('div');
  titleWrap.style.minWidth = '0';
  const title = document.createElement('div');
  title.className = 'queue-item-title';
  title.textContent = entry.title || entry.url;
  const sub = document.createElement('div');
  sub.className = 'queue-item-url';
  sub.textContent = entry.url || '';
  titleWrap.append(title, sub);

  const statePill = document.createElement('span');
  statePill.className = 'job-state';
  statePill.dataset.state = entry.status || 'completed';
  statePill.textContent = QUEUE_STATE_LABELS[entry.status] || entry.status || 'Concluido';
  head.append(titleWrap, statePill);
  item.appendChild(head);

  const meta = document.createElement('div');
  meta.className = 'queue-item-meta';
  const bits = [];
  if (entry.date) bits.push(formatDate(entry.date));
  if (entry.provider) bits.push(entry.provider);
  if (entry.format) bits.push(entry.format);
  if (entry.size) bits.push(formatBytes(entry.size));
  if (entry.destination) bits.push(entry.destination);
  meta.textContent = bits.join(' · ');
  item.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'queue-item-actions';
  const act = (label, fn) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'button button-ghost';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      fn().catch(() => {});
      onRefresh?.();
      onRefreshBoth?.();
    });
    actions.appendChild(btn);
  };

  if (entry.destination) {
    act('Abrir arquivo', () => window.api.openFile({ filePath: entry.destination }));
    act('Mostrar na pasta', () => window.api.showInFolder({ filePath: entry.destination }));
  }
  act('Baixar de novo', () => window.api.historyRedownload(entry.id));
  act('Remover', () => window.api.historyRemove(entry.id));
  item.appendChild(actions);
  return item;
}
