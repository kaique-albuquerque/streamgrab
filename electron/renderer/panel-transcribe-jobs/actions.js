/**
 * Botões de ação de um item da lista de jobs de transcrição.
 */

function appendActionBtn(actions, label, fn) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'button button-ghost';
  btn.textContent = label;
  btn.addEventListener('click', () => fn?.());
  actions.appendChild(btn);
}

/**
 * Monta os botões disponíveis para o status atual do job.
 * Retorna `null` quando não há nenhuma ação.
 */
export function renderActions(job, onJobAction) {
  const actions = document.createElement('div');
  actions.className = 'queue-item-actions';

  if (job.status === 'running' || job.status === 'queued') {
    appendActionBtn(actions, 'Cancelar', () => onJobAction?.('cancel', job));
  }
  if (job.status === 'error' || job.status === 'cancelled') {
    appendActionBtn(actions, 'Repetir', () => onJobAction?.('retry', job));
  }
  if (job.status === 'done' && job.files?.[0]?.path) {
    appendActionBtn(actions, 'Mostrar na pasta', () => onJobAction?.('reveal', job));
  }
  if (['done', 'error', 'cancelled'].includes(job.status)) {
    appendActionBtn(actions, 'Remover', () => onJobAction?.('remove', job));
  }

  return actions.childElementCount > 0 ? actions : null;
}
