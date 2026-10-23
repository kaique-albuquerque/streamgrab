/**
 * Fila — botões de ação por estado do job.
 */

import { ACTIVE_STATES } from '../panel-constants.js';

/** Monta a barra de ações conforme o estado do job. */
export function renderQueueActions({ job, state, terminal, refresh }) {
  const actions = document.createElement('div');
  actions.className = 'queue-item-actions';

  const act = (label, fn) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'button button-ghost';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      fn().catch(() => {});
      refresh();
    });
    actions.appendChild(btn);
  };

  if (state === 'queued') {
    act('Cancelar', () => window.api.queueCancel(job.id));
  } else if (ACTIVE_STATES.has(state)) {
    act('Pausar', () => window.api.queuePause(job.id));
    act('Cancelar', () => window.api.queueCancel(job.id));
  } else if (state === 'paused') {
    act('Retomar', () => window.api.queueResume(job.id));
    act('Cancelar', () => window.api.queueCancel(job.id));
  } else if (terminal) {
    if (state === 'completed' && job.meta?.output) {
      act('Abrir arquivo', () => window.api.openFile({ filePath: job.meta.output }));
      act('Mostrar na pasta', () => window.api.showInFolder({ filePath: job.meta.output }));
    }
    if (state === 'failed' || state === 'cancelled') {
      act('Tentar novamente', () => window.api.queueRetry(job.id));
    }
    act('Remover', () => window.api.queueRemove(job.id));
  }

  return actions;
}
