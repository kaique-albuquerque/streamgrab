/** Exportação do histórico filtrado para CSV/JSON. */

import { formatBytes } from '../shared.js';
import { historyStatus } from './render.js';

export async function exportHistory(format, getVisible) {
  const entries = getVisible ? getVisible() : undefined;
  const result = await window.api.exportHistory({ format, entries });

  if (result?.ok) {
    const size = formatBytes(result.size || 0);
    historyStatus(`Histórico exportado: ${result.count ?? '?'} registros (${size}).`);
  } else if (result?.canceled) {
    // Silencioso
  } else {
    historyStatus(result?.error || 'Falha ao exportar o histórico.', false);
  }
}
