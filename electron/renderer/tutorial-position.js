/**
 * Tutorial — Posicionamento inteligente do tooltip.
 *
 * Calcula posição com fallback automático quando não há espaço
 * na posição preferida ou quando o tooltip sobreporia o alvo.
 */

const GAP = 12;

/**
 * Posiciona o tooltip relativo ao targetEl, com fallback automático.
 * @param {HTMLElement} tooltip
 * @param {HTMLElement|null} targetEl
 * @param {string} preferredPosition - 'top' | 'bottom' | 'left' | 'right'
 */
export function positionTooltip(tooltip, targetEl, preferredPosition) {
  if (!tooltip || !targetEl) return;

  const targetRect = targetEl.getBoundingClientRect();

  tooltip.style.visibility = 'hidden';
  tooltip.style.display = 'block';
  const tooltipRect = tooltip.getBoundingClientRect();

  function calcPos(position) {
    let top, left, arrowClass;
    switch (position) {
      case 'top':
        top = targetRect.top - tooltipRect.height - GAP;
        left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
        arrowClass = 'arrow-bottom';
        break;
      case 'bottom':
        top = targetRect.bottom + GAP;
        left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
        arrowClass = 'arrow-top';
        break;
      case 'left':
        top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
        left = targetRect.left - tooltipRect.width - GAP;
        arrowClass = 'arrow-right';
        break;
      case 'right':
        top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
        left = targetRect.right + GAP;
        arrowClass = 'arrow-left';
        break;
    }
    return { top, left, arrowClass };
  }

  function hasSpace(position) {
    const pos = calcPos(position);
    const fitsVertically = pos.top >= GAP && pos.top + tooltipRect.height <= window.innerHeight - GAP;
    const fitsHorizontally = pos.left >= GAP && pos.left + tooltipRect.width <= window.innerWidth - GAP;
    return fitsVertically && fitsHorizontally;
  }

  function wouldOverlapTarget(position) {
    const pos = calcPos(position);
    const tTop = Math.max(GAP, Math.min(pos.top, window.innerHeight - tooltipRect.height - GAP));
    const tLeft = Math.max(GAP, Math.min(pos.left, window.innerWidth - tooltipRect.width - GAP));
    const tRight = tLeft + tooltipRect.width;
    const tBottom = tTop + tooltipRect.height;
    const overlapX = tLeft < targetRect.right && tRight > targetRect.left;
    const overlapY = tTop < targetRect.bottom && tBottom > targetRect.top;
    return overlapX && overlapY;
  }

  const opposites = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  const fallbacks = ['top', 'bottom', 'left', 'right'];

  let chosenPosition = preferredPosition;
  if (!hasSpace(preferredPosition) || wouldOverlapTarget(preferredPosition)) {
    const opposite = opposites[preferredPosition];
    if (hasSpace(opposite) && !wouldOverlapTarget(opposite)) {
      chosenPosition = opposite;
    } else {
      for (const fb of fallbacks) {
        if (hasSpace(fb) && !wouldOverlapTarget(fb)) {
          chosenPosition = fb;
          break;
        }
      }
    }
  }

  const { top, left, arrowClass } = calcPos(chosenPosition);
  const clampedTop = Math.max(GAP, Math.min(top, window.innerHeight - tooltipRect.height - GAP));
  const clampedLeft = Math.max(GAP, Math.min(left, window.innerWidth - tooltipRect.width - GAP));

  tooltip.style.visibility = '';
  tooltip.style.top = `${clampedTop}px`;
  tooltip.style.left = `${clampedLeft}px`;
  tooltip.classList.add(arrowClass);
}
