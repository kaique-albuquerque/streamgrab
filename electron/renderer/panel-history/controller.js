/**
 * Composição do painel de histórico: busca, filtros, render e exportação.
 */

import { bindHistoryFilters } from './filters.js';
import { exportHistory } from './export.js';
import { renderHistoryEntries } from './render.js';
import { renderHistoryItem } from './item.js';

export function createHistoryPanel({ onRefreshBoth }) {
  let historyFilters = null;

  const renderItem = (entry) => renderHistoryItem(entry, { onRefresh: refreshHistoryPanel, onRefreshBoth });

  function ensureHistoryFilters() {
    if (historyFilters) return historyFilters;
    historyFilters = bindHistoryFilters({
      onFiltered: (filtered, total) => renderHistoryEntries(filtered, total, renderItem),
      onExport: (format) => exportHistory(format, () => historyFilters?.getVisible()),
    });
    return historyFilters;
  }

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

    renderHistoryEntries(list, list.length, renderItem);
  }

  return { refreshHistoryPanel };
}
