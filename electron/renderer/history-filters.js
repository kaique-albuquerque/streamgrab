/**
 * HistoryFilters — Busca e filtros client-side do histórico.
 *
 * SPEC-04: docs/specs/04-pesquisa-historico.md
 *
 * Toda a filtragem acontece sobre o array já carregado de history.json,
 * sem round-trip ao processo main.
 */

export { createHistoryFilters } from './history-filters/index.js';
export { filterEntries } from './history-filters/filter.js';
export { matchesSearch, matchesPeriod, matchesStatus } from './history-filters/matchers.js';
export { sortEntries } from './history-filters/sort.js';
