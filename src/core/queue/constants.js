/**
 * DownloadQueue — state constants and helpers.
 */

/** Estados que a fila considera "em andamento" (nao podem ser reordenados). */
export const RUNNING_STATES = new Set([
  'analyzing', 'preparing', 'downloading', 'paused', 'merging',
]);

export const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled']);

export function isNonTerminal(job) {
  return job && !TERMINAL_STATES.has(job.state);
}
