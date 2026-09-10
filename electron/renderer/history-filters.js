/**
 * HistoryFilters — Busca e filtros client-side do histórico.
 *
 * SPEC-04: docs/specs/04-pesquisa-historico.md
 *
 * Toda a filtragem acontece sobre o array já carregado de history.json,
 * sem round-trip ao processo main.
 */

const PERIODS = {
  all: Infinity,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const DEBOUNCE_MS = 200;

export function createHistoryFilters({ onFiltered }) {
  let entries = [];
  const state = {
    search: '',
    period: 'all',
    status: 'all',
    sortBy: 'date',
    sortOrder: 'desc',
  };
  let debounceTimer = null;

  function setEntries(raw) {
    entries = Array.isArray(raw) ? raw : [];
    apply();
  }

  /** Aplica os filtros ativos e devolve as entradas visíveis. */
  function apply() {
    const filtered = filterEntries(entries, state);
    if (typeof onFiltered === 'function') onFiltered(filtered, entries.length);
    return filtered;
  }

  /** Atualiza um filtro individual e re-aplica. */
  function setFilter(key, value) {
    if (key === 'search') {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        state.search = String(value || '').trim();
        apply();
      }, DEBOUNCE_MS);
      return;
    }
    if (key in state) {
      state[key] = value;
      apply();
    }
  }

  /** Alterna a ordenação (mesma coluna inverte a direção). */
  function setSort(sortBy) {
    if (state.sortBy === sortBy) {
      state.sortOrder = state.sortOrder === 'desc' ? 'asc' : 'desc';
    } else {
      state.sortBy = sortBy;
      state.sortOrder = sortBy === 'title' || sortBy === 'provider' ? 'asc' : 'desc';
    }
    apply();
  }

  /** Zera todos os filtros. */
  function reset() {
    clearTimeout(debounceTimer);
    state.search = '';
    state.period = 'all';
    state.status = 'all';
    state.sortBy = 'date';
    state.sortOrder = 'desc';
    apply();
  }

  function getState() {
    return { ...state };
  }

  /** Devolve as entradas atualmente visíveis (para exportação). */
  function getVisible() {
    return filterEntries(entries, state);
  }

  function hasActiveFilters() {
    return state.search !== '' || state.period !== 'all' || state.status !== 'all';
  }

  function destroy() {
    clearTimeout(debounceTimer);
    entries = [];
  }

  return { setEntries, setFilter, setSort, reset, getState, getVisible, hasActiveFilters, apply, destroy };
}

// ---------------------------------------------------------------------------
// Filtragem pura (exportada para testes)
// ---------------------------------------------------------------------------

export function filterEntries(entries, state = {}) {
  const { search = '', period = 'all', status = 'all', sortBy = 'date', sortOrder = 'desc' } = state;

  const filtered = (Array.isArray(entries) ? entries : [])
    .filter((entry) => matchesSearch(entry, search))
    .filter((entry) => matchesPeriod(entry, period))
    .filter((entry) => matchesStatus(entry, status));

  return sortEntries(filtered, sortBy, sortOrder);
}

export function matchesSearch(entry, search) {
  const term = String(search || '').trim().toLowerCase();
  if (!term) return true;
  return [entry?.title, entry?.url, entry?.provider, entry?.format, entry?.destination]
    .some((field) => String(field || '').toLowerCase().includes(term));
}

export function matchesPeriod(entry, period) {
  const window = PERIODS[period];
  if (!window || !Number.isFinite(window)) return true;
  const t = Date.parse(entry?.date || '');
  if (!Number.isFinite(t)) return true; // data inválida não é excluída
  return Date.now() - t <= window;
}

export function matchesStatus(entry, status) {
  if (!status || status === 'all') return true;
  return String(entry?.status || 'completed') === status;
}

export function sortEntries(entries, sortBy, sortOrder) {
  const dir = sortOrder === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'title':
        cmp = String(a?.title || '').localeCompare(String(b?.title || ''));
        break;
      case 'size':
        cmp = (Number(a?.size) || 0) - (Number(b?.size) || 0);
        break;
      case 'provider':
        cmp = String(a?.provider || '').localeCompare(String(b?.provider || ''));
        break;
      case 'date':
      default:
        cmp = (Date.parse(a?.date || '') || 0) - (Date.parse(b?.date || '') || 0);
        break;
    }
    return cmp * dir;
  });
}