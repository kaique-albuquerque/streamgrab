/**
 * HistoryFilters — controlador com estado, debounce e callbacks.
 *
 * SPEC-04: docs/specs/04-pesquisa-historico.md
 */

import { DEBOUNCE_MS } from './constants.js';
import { filterEntries } from './filter.js';

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
