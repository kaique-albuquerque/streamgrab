/**
 * HistoryFilters — composição dos filtros e ordenação.
 */

import { matchesSearch, matchesPeriod, matchesStatus } from './matchers.js';
import { sortEntries } from './sort.js';

export function filterEntries(entries, state = {}) {
  const { search = '', period = 'all', status = 'all', sortBy = 'date', sortOrder = 'desc' } = state;

  const filtered = (Array.isArray(entries) ? entries : [])
    .filter((entry) => matchesSearch(entry, search))
    .filter((entry) => matchesPeriod(entry, period))
    .filter((entry) => matchesStatus(entry, status));

  return sortEntries(filtered, sortBy, sortOrder);
}
