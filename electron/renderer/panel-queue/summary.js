/**
 * Fila — resumo textual e badge do estado da fila.
 */

import { TERMINAL_STATES, ACTIVE_STATES } from '../panel-constants.js';

/** Atualiza badge, botão de pausa, resumo e estado vazio. */
export function renderQueueSummary({ jobs, data }) {
  const emptyEl = document.getElementById('queueEmpty');
  const summaryEl = document.getElementById('queueSummary');
  const badgeEl = document.getElementById('queueBadge');
  const toggleBtn = document.getElementById('queueTogglePauseBtn');

  const activeCount = jobs.filter((job) => ACTIVE_STATES.has(job.state)).length;
  const nonTerminal = jobs.filter((job) => !TERMINAL_STATES.has(job.state));
  const hasFailed = jobs.some((job) => job.state === 'failed');

  if (badgeEl) {
    badgeEl.hidden = nonTerminal.length === 0;
    badgeEl.textContent = String(nonTerminal.length);
    badgeEl.dataset.status = hasFailed ? 'error' : activeCount > 0 ? 'active' : 'idle';
  }
  if (toggleBtn) toggleBtn.textContent = data.paused ? 'Retomar fila' : 'Pausar fila';
  if (summaryEl) {
    summaryEl.textContent =
      `${activeCount}/${data.maxConcurrent} ativos · ${nonTerminal.length} na fila · ` +
      `${jobs.length - nonTerminal.length} concluidos/falhos/cancelados`;
  }
  if (emptyEl) emptyEl.hidden = jobs.length > 0;
}
