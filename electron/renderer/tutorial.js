/**
 * TutorialController — Tour interativo para novos usuários.
 *
 * SPEC-02: docs/specs/02-tutorial-interativo.md
 *
 * Orquestra overlay, tooltip e navegação entre passos.
 * Módulos dedicados:
 *  - tutorial-steps.js     → definição dos passos
 *  - tutorial-position.js  → posicionamento inteligente do tooltip
 *  - tutorial-modals.js    → modais de URL Help e Quick Tips
 */

import { STEPS } from './tutorial-steps.js';
import { positionTooltip } from './tutorial-position.js';
import { showUrlHelp as _showUrlHelp, showQuickTips as _showQuickTips } from './tutorial-modals.js';

export function createTutorialController({ onFinish, onSkip }) {
  let overlay = null;
  let tooltip = null;
  let isActive = false;
  let savedScrollY = 0;

  function start() {
    if (isActive) return;
    isActive = true;
    savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    window.scrollTo(0, 0);
    requestAnimationFrame(() => showStep(0));
  }

  function stop() {
    isActive = false;
    restoreScroll();
    cleanup();
    if (typeof onSkip === 'function') onSkip();
  }

  function finish() {
    isActive = false;
    restoreScroll();
    cleanup();
    if (typeof onFinish === 'function') onFinish();
  }

  function restoreScroll() {
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    window.scrollTo(0, savedScrollY);
  }

  function showStep(index) {
    cleanup();

    const step = STEPS[index];
    if (!step) {
      finish();
      return;
    }

    overlay = document.createElement('div');
    overlay.className = 'tour-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) stop();
    });
    document.body.appendChild(overlay);

    const targetEl = document.querySelector(step.target);
    if (targetEl) {
      targetEl.classList.add('tour-highlight');
    }

    tooltip = document.createElement('div');
    tooltip.className = 'tour-tooltip';
    tooltip.setAttribute('role', 'dialog');
    tooltip.setAttribute('aria-label', `Tour: ${step.title}`);

    const titleEl = document.createElement('div');
    titleEl.className = 'tour-tooltip-title';
    titleEl.textContent = step.title;

    const textEl = document.createElement('div');
    textEl.className = 'tour-tooltip-text';
    textEl.textContent = step.text;

    const navEl = document.createElement('div');
    navEl.className = 'tour-tooltip-nav';

    if (index > 0) {
      const prevBtn = document.createElement('button');
      prevBtn.className = 'button button-ghost';
      prevBtn.textContent = '← Anterior';
      prevBtn.addEventListener('click', () => showStep(index - 1));
      navEl.appendChild(prevBtn);
    }

    const isLast = index === STEPS.length - 1;
    const nextBtn = document.createElement('button');
    nextBtn.className = isLast ? 'button button-accent' : 'button button-primary';
    nextBtn.textContent = isLast ? '✓ Concluir' : 'Próximo →';
    nextBtn.addEventListener('click', () => {
      if (isLast) finish();
      else showStep(index + 1);
    });
    navEl.appendChild(nextBtn);

    const skipBtn = document.createElement('button');
    skipBtn.className = 'button button-ghost';
    skipBtn.textContent = 'Pular';
    skipBtn.addEventListener('click', () => stop());
    navEl.appendChild(skipBtn);

    tooltip.append(titleEl, textEl, navEl);
    document.body.appendChild(tooltip);

    positionTooltip(tooltip, targetEl, step.position);
  }

  function cleanup() {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    overlay = null;

    if (tooltip && tooltip.parentNode) {
      tooltip.parentNode.removeChild(tooltip);
    }
    tooltip = null;

    for (const step of STEPS) {
      const el = document.querySelector(step.target);
      if (el) el.classList.remove('tour-highlight');
    }
  }

  function isRunning() {
    return isActive;
  }

  return {
    start,
    stop,
    finish,
    showUrlHelp: _showUrlHelp,
    showQuickTips: _showQuickTips,
    isRunning,
  };
}