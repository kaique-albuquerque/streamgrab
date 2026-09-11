/**
 * Painel de histórico — renderiza entradas, filtros, exportação e busca.
 */

import { formatBytes, formatDate } from './shared.js';
import { createHistoryFilters } from './history-filters.js';
import { QUEUE_STATE_LABELS } from './panel-constants.js';

export function createHistoryPanel({ onRefreshBoth }) {
  let historyFilters = null;

  async function refreshHistoryPanel() {
    const listEl = document.getElementById('historyList');
    if (!listEl) return;

    let entries;
    try {
      entries = await window.api.historyList();
    } catch {
      return;
    }
    const list = entries || [];

    ensureHistoryFilters();
    if (historyFilters) {
      historyFilters.setEntries(list);
      return;
    }

    renderHistoryEntries(list, list.length);
  }

  function ensureHistoryFilters() {
    if (historyFilters) return historyFilters;
    const searchInput = document.getElementById('historySearch');
    if (!searchInput) return null;

    historyFilters = createHistoryFilters({
      onFiltered: (filtered, total) => renderHistoryEntries(filtered, total),
    });

    searchInput.addEventListener('input', () => historyFilters?.setFilter('search', searchInput.value));

    const periodGroup = document.getElementById('historyPeriodGroup');
    if (periodGroup) {
      periodGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-period]');
        if (!btn) return;
        periodGroup.querySelectorAll('[data-period]').forEach((b) => b.classList.toggle('active', b === btn));
        historyFilters?.setFilter('period', btn.dataset.period);
      });
    }

    const statusGroup = document.getElementById('historyStatusGroup');
    if (statusGroup) {
      statusGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-status]');
        if (!btn) return;
        statusGroup.querySelectorAll('[data-status]').forEach((b) => b.classList.toggle('active', b === btn));
        historyFilters?.setFilter('status', btn.dataset.status);
      });
    }

    const exportCsvBtn = document.getElementById('historyExportCsvBtn');
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => exportHistory('csv'));

    const exportJsonBtn = document.getElementById('historyExportJsonBtn');
    if (exportJsonBtn) exportJsonBtn.addEventListener('click', () => exportHistory('json'));

    const sortSelect = document.getElementById('historySort');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => historyFilters?.setSort(sortSelect.value));
    }

    const resetBtn = document.getElementById('historyResetFiltersBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        historyFilters?.reset();
        if (searchInput) searchInput.value = '';
        if (sortSelect) sortSelect.value = 'date';
        periodGroup?.querySelectorAll('[data-period]').forEach((b) => b.classList.toggle('active', b.dataset.period === 'all'));
        statusGroup?.querySelectorAll('[data-status]').forEach((b) => b.classList.toggle('active', b.dataset.status === 'all'));
      });
    }

    return historyFilters;
  }

  function renderHistoryEntries(visible, total) {
    const listEl = document.getElementById('historyList');
    if (!listEl) return;
    const emptyEl = document.getElementById('historyEmpty');
    const summaryEl = document.getElementById('historySummary');

    const count = visible.length;
    if (summaryEl) {
      summaryEl.textContent = count === total
        ? `${total} registro${total === 1 ? '' : 's'}`
        : `${count} de ${total} registro${total === 1 ? '' : 's'}`;
    }

    listEl.innerHTML = '';
    if (count === 0) {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = total > 0
          ? 'Nenhum download encontrado. Tente ajustar a busca ou os filtros.'
          : 'Nenhum download registrado ainda.';
      }
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    for (const entry of visible) listEl.appendChild(renderHistoryItem(entry));
  }

  async function exportHistory(format) {
    const entries = historyFilters ? historyFilters.getVisible() : undefined;
    const result = await window.api.exportHistory({ format, entries });

    if (result?.ok) {
      const size = formatBytes(result.size || 0);
      historyStatus(`Histórico exportado: ${result.count ?? '?'} registros (${size}).`);
    } else if (result?.canceled) {
      // Silencioso
    } else {
      historyStatus(result?.error || 'Falha ao exportar o histórico.', false);
    }
  }

  function historyStatus(text, ok = true) {
    const el = document.getElementById('historySummary');
    if (el) {
      el.textContent = text;
      el.style.color = ok ? '' : 'var(--danger)';
      setTimeout(() => { el.style.color = ''; }, 4000);
    }
  }

  function renderHistoryItem(entry) {
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
        refreshHistoryPanel();
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

  return { refreshHistoryPanel };
}
