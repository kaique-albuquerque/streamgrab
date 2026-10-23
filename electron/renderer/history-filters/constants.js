/**
 * HistoryFilters — constantes de período e debounce.
 */

export const PERIODS = {
  all: Infinity,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export const DEBOUNCE_MS = 200;
