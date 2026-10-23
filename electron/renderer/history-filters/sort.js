/**
 * HistoryFilters — ordenação das entradas filtradas.
 */

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
