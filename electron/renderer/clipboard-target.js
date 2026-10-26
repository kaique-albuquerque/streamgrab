/**
 * Destino da URL detectada na clipboard.
 *
 * A URL vai para a aba ativa; se ela ja estiver em uso (URL preenchida,
 * analise ou download em andamento), abre-se uma aba nova para nao
 * sobrescrever o trabalho atual.
 */

/** Estados de job que indicam que a aba ja esta ocupada. */
const BUSY_JOB_STATES = new Set(['active', 'queued']);

/** `true` quando a URL detectada precisa de uma aba nova. */
export function needsNewTab(tab) {
  if (!tab) return true;
  const currentUrl = String(tab.fields?.url?.value ?? '').trim();
  if (currentUrl) return true;
  if (tab.busy) return true;
  return BUSY_JOB_STATES.has(tab.jobState);
}
