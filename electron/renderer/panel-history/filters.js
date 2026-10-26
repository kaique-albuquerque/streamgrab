/**
 * Bindings dos controles de filtro/ordenação/exportação do histórico.
 */

import { createHistoryFilters } from '../history-filters.js';

/**
 * Cria a instância de filtros e liga os controles do DOM.
 * Retorna o objeto de filtros (null quando o painel não está no DOM).
 */
export function bindHistoryFilters({ onFiltered, onExport }) {
  const searchInput = document.getElementById('historySearch');
  if (!searchInput) return null;

  const filters = createHistoryFilters({ onFiltered });
  const periodGroup = document.getElementById('historyPeriodGroup');
  const statusGroup = document.getElementById('historyStatusGroup');
  const sortSelect = document.getElementById('historySort');

  searchInput.addEventListener('input', () => filters.setFilter('search', searchInput.value));

  if (periodGroup) {
    periodGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-period]');
      if (!btn) return;
      periodGroup.querySelectorAll('[data-period]').forEach((b) => b.classList.toggle('active', b === btn));
      filters.setFilter('period', btn.dataset.period);
    });
  }

  if (statusGroup) {
    statusGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-status]');
      if (!btn) return;
      statusGroup.querySelectorAll('[data-status]').forEach((b) => b.classList.toggle('active', b === btn));
      filters.setFilter('status', btn.dataset.status);
    });
  }

  const exportCsvBtn = document.getElementById('historyExportCsvBtn');
  if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => onExport('csv'));

  const exportJsonBtn = document.getElementById('historyExportJsonBtn');
  if (exportJsonBtn) exportJsonBtn.addEventListener('click', () => onExport('json'));

  if (sortSelect) {
    sortSelect.addEventListener('change', () => filters.setSort(sortSelect.value));
  }

  const resetBtn = document.getElementById('historyResetFiltersBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      filters.reset();
      searchInput.value = '';
      if (sortSelect) sortSelect.value = 'date';
      periodGroup?.querySelectorAll('[data-period]').forEach((b) => b.classList.toggle('active', b.dataset.period === 'all'));
      statusGroup?.querySelectorAll('[data-status]').forEach((b) => b.classList.toggle('active', b.dataset.status === 'all'));
    });
  }

  return filters;
}
