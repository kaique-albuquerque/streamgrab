/**
 * Renderização da lista de histórico e mensagens de status do painel.
 */

export function renderHistoryEntries(visible, total, renderItem) {
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
  for (const entry of visible) listEl.appendChild(renderItem(entry));
}

export function historyStatus(text, ok = true) {
  const el = document.getElementById('historySummary');
  if (el) {
    el.textContent = text;
    el.style.color = ok ? '' : 'var(--danger)';
    setTimeout(() => { el.style.color = ''; }, 4000);
  }
}
