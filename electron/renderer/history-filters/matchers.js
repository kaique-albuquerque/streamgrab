/**
 * HistoryFilters — predicados puros de correspondência.
 */

import { PERIODS } from './constants.js';

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
