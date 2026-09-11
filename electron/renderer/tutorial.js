/**
 * TutorialController — Tour interativo para novos usuários.
 *
 * SPEC-02: docs/specs/02-tutorial-interativo.md
 *
 * Exibe um overlay semi-transparente com destaques nos elementos da UI
 * e tooltips explicativos. O tour roda automaticamente na primeira
 * execução e pode ser reaberto pelo botão de ajuda.
 */

const STEPS = [
  {
    target: '[data-field="url"]',
    position: 'bottom',
    title: 'Passo 1 de 4',
    text: '📋 Cole a URL do vídeo\n\nAbra o vídeo no navegador, aperte F12 → Network, filtre por "m3u8", copie a URL do request e cole aqui.',
  },
  {
    target: '[data-action="analyze"]',
    position: 'top',
    title: 'Passo 2 de 4',
    text: '🔍 Analise o conteúdo\n\nClique em "Analisar playlist" para descobrir as qualidades de vídeo disponíveis.',
  },
  {
    target: '[data-field="qualities"]',
    position: 'bottom',
    title: 'Passo 3 de 4',
    text: '🎬 Escolha a qualidade\n\nSelecione a qualidade desejada. A melhor disponível é usada automaticamente se você não escolher nenhuma.',
  },
  {
    target: '[data-action="download"]',
    position: 'top',
    title: 'Passo 4 de 4',
    text: '⬇️ Baixe o vídeo\n\nClique em "Baixar agora" e aguarde. O arquivo será salvo na pasta Downloads.\n\nAcompanhe o progresso na aba "Fila".',
  },
];

export function createTutorialController({ onFinish, onSkip }) {
  let overlay = null;
  let tooltip = null;
  let isActive = false;

  function start() {
    if (isActive) return;
    isActive = true;
    showStep(0);
  }

  function stop() {
    isActive = false;
    cleanup();
    if (typeof onSkip === 'function') onSkip();
  }

  function finish() {
    isActive = false;
    cleanup();
    if (typeof onFinish === 'function') onFinish();
  }

  function showStep(index) {
    cleanup();

    const step = STEPS[index];
    if (!step) {
      finish();
      return;
    }

    // Overlay
    overlay = document.createElement('div');
    overlay.className = 'tour-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) stop();
    });
    document.body.appendChild(overlay);

    // Destacar elemento alvo
    const targetEl = document.querySelector(step.target);
    if (targetEl) {
      targetEl.classList.add('tour-highlight');
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Tooltip
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

    // Posicionar tooltip próximo ao alvo
    positionTooltip(targetEl, step.position);
  }

  function positionTooltip(targetEl, preferredPosition) {
    if (!tooltip || !targetEl) return;

    const targetRect = targetEl.getBoundingClientRect();
    const gap = 12;

    // Medir tooltip com position temporaria para calcular tamanho real
    tooltip.style.visibility = 'hidden';
    tooltip.style.display = 'block';
    const tooltipRect = tooltip.getBoundingClientRect();

    // Helper: calcular posicao para uma dada posicao preferida
    function calcPos(position) {
      let top, left, arrowClass;
      switch (position) {
        case 'top':
          top = targetRect.top - tooltipRect.height - gap;
          left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
          arrowClass = 'arrow-bottom';
          break;
        case 'bottom':
          top = targetRect.bottom + gap;
          left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
          arrowClass = 'arrow-top';
          break;
        case 'left':
          top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
          left = targetRect.left - tooltipRect.width - gap;
          arrowClass = 'arrow-right';
          break;
        case 'right':
          top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
          left = targetRect.right + gap;
          arrowClass = 'arrow-left';
          break;
      }
      return { top, left, arrowClass };
    }

    // Verificar se ha espaco suficiente na posicao preferida
    function hasSpace(position) {
      const pos = calcPos(position);
      const fitsVertically = pos.top >= gap && pos.top + tooltipRect.height <= window.innerHeight - gap;
      const fitsHorizontally = pos.left >= gap && pos.left + tooltipRect.width <= window.innerWidth - gap;
      return fitsVertically && fitsHorizontally;
    }

    // Verificar se o tooltip ficaria em cima do proprio alvo (overlap)
    function wouldOverlapTarget(position) {
      const pos = calcPos(position);
      const tTop = Math.max(gap, Math.min(pos.top, window.innerHeight - tooltipRect.height - gap));
      const tLeft = Math.max(gap, Math.min(pos.left, window.innerWidth - tooltipRect.width - gap));
      const tRight = tLeft + tooltipRect.width;
      const tBottom = tTop + tooltipRect.height;
      const overlapX = tLeft < targetRect.right && tRight > targetRect.left;
      const overlapY = tTop < targetRect.bottom && tBottom > targetRect.top;
      return overlapX && overlapY;
    }

    // Ordem de fallback: preferida -> oposta -> laterais
    const opposites = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
    const fallbacks = ['top', 'bottom', 'left', 'right'];

    let chosenPosition = preferredPosition;
    if (!hasSpace(preferredPosition) || wouldOverlapTarget(preferredPosition)) {
      // Tenta a oposta primeiro
      const opposite = opposites[preferredPosition];
      if (hasSpace(opposite) && !wouldOverlapTarget(opposite)) {
        chosenPosition = opposite;
      } else {
        // Tenta qualquer uma que caiba e nao sobreponha
        for (const fb of fallbacks) {
          if (hasSpace(fb) && !wouldOverlapTarget(fb)) {
            chosenPosition = fb;
            break;
          }
        }
      }
    }

    const { top, left, arrowClass } = calcPos(chosenPosition);

    // Limitar à viewport como ultima garantia
    const clampedTop = Math.max(gap, Math.min(top, window.innerHeight - tooltipRect.height - gap));
    const clampedLeft = Math.max(gap, Math.min(left, window.innerWidth - tooltipRect.width - gap));

    tooltip.style.visibility = '';
    tooltip.style.top = `${clampedTop}px`;
    tooltip.style.left = `${clampedLeft}px`;
    tooltip.classList.add(arrowClass);
  }

  function cleanup() {
    // Remover overlay
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    overlay = null;

    // Remover tooltip
    if (tooltip && tooltip.parentNode) {
      tooltip.parentNode.removeChild(tooltip);
    }
    tooltip = null;

    // Remover destaques
    for (const step of STEPS) {
      const el = document.querySelector(step.target);
      if (el) el.classList.remove('tour-highlight');
    }
  }

  function showUrlHelp() {
    const modal = document.createElement('div');
    modal.className = 'tour-modal-overlay';
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    modal.innerHTML = `
      <div class="tour-modal">
        <div class="tour-modal-header">
          <h2>❓ Como obter a URL do vídeo</h2>
          <button class="button button-ghost tour-modal-close" type="button">✕</button>
        </div>
        <div class="tour-modal-body">
          <ol class="tour-steps-list">
            <li><strong>Abra o vídeo</strong> no navegador e <strong>dê play</strong> para garantir que está carregando.</li>
            <li>Pressione <kbd>F12</kbd> para abrir o <strong>DevTools</strong> (ferramentas do desenvolvedor).</li>
            <li>Vá na aba <strong>Network</strong> (Rede).</li>
            <li>Digite <kbd>m3u8</kbd> no filtro (ou <kbd>media</kbd> — varia por plataforma).</li>
            <li>Clique no request que aparece na lista.</li>
            <li>Clique com o <strong>botão direito</strong> → <strong>Copy</strong> → <strong>Copy Request URL</strong>.</li>
            <li><strong>Cole a URL</strong> no StreamGrab e clique em <strong>Analisar</strong>.</li>
          </ol>
          <div class="tour-modal-tip">
            💡 Dica: para YouTube, Instagram, Facebook e TikTok, basta copiar o link do vídeo da barra de endereços!
          </div>
        </div>
        <div class="tour-modal-footer">
          <button class="button button-accent tour-modal-close-btn" type="button">Entendi!</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    modal.querySelector('.tour-modal-close').addEventListener('click', () => modal.remove());
    modal.querySelector('.tour-modal-close-btn').addEventListener('click', () => modal.remove());
  }

  function showQuickTips() {
    const modal = document.createElement('div');
    modal.className = 'tour-modal-overlay';
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    modal.innerHTML = `
      <div class="tour-modal">
        <div class="tour-modal-header">
          <h2>💡 Dicas rápidas</h2>
          <button class="button button-ghost tour-modal-close" type="button">✕</button>
        </div>
        <div class="tour-modal-body">
          <ul class="tour-tips">
            <li>🚀 Use o <strong>modo Turbo</strong> para downloads mais rápidos em arquivos diretos e YouTube.</li>
            <li>📋 Ative a <strong>detecção automática de URL</strong> nas Configurações.</li>
            <li>📦 Use <strong>Download em lote</strong> para baixar vários vídeos de uma vez.</li>
            <li>⏸️ Downloads em andamento podem ser <strong>pausados e retomados</strong> na aba Fila.</li>
            <li>🔍 Use a <strong>busca no Histórico</strong> para encontrar downloads antigos.</li>
            <li>📤 <strong>Exporte seu histórico</strong> em CSV ou JSON para backup.</li>
          </ul>
        </div>
        <div class="tour-modal-footer">
          <button class="button button-accent tour-modal-close-btn" type="button">Legal!</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('.tour-modal-close').addEventListener('click', () => modal.remove());
    modal.querySelector('.tour-modal-close-btn').addEventListener('click', () => modal.remove());
  }

  function isRunning() {
    return isActive;
  }

  return {
    start,
    stop,
    finish,
    showUrlHelp,
    showQuickTips,
    isRunning,
  };
}