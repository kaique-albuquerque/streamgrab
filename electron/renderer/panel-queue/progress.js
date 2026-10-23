/**
 * Fila — barra de progresso compacta.
 */

/** Monta a mini barra de progresso do item. */
export function renderMiniProgress(percent) {
  const mini = document.createElement('div');
  mini.className = 'mini-progress';

  const bar = document.createElement('div');
  bar.className = 'progress-bar';

  const fill = document.createElement('span');
  fill.style.width = `${percent}%`;
  bar.appendChild(fill);

  mini.appendChild(bar);
  return mini;
}
