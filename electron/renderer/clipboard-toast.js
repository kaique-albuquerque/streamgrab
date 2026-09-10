/**
 * ClipboardToast — Componente de toast para URLs detectadas na clipboard.
 *
 * Exibe um slide-in toast quando uma URL de mídia é detectada, com ações
 * para analisar, preencher o campo ou ignorar.
 */

export function createClipboardToast() {
  let toastEl = null;
  let autoDismissTimer = null;

  const SOURCE_LABELS = {
    youtube: 'YouTube',
    hls: 'HLS',
    dash: 'DASH',
    direct: 'Arquivo direto',
    social: 'Rede social',
  };

  function show({ url, sourceType, onAnalyze, onFillOnly }) {
    // Remove toast anterior se existir
    dismiss();

    const label = SOURCE_LABELS[sourceType] || sourceType;

    toastEl = document.createElement('div');
    toastEl.className = 'clipboard-toast';
    toastEl.setAttribute('role', 'alert');
    toastEl.innerHTML = `
      <div class="toast-content">
        <span class="toast-icon">🔗</span>
        <div class="toast-text">
          <strong>URL de ${label} detectada!</strong>
          <span class="toast-url">${escapeHtml(truncateUrl(url, 60))}</span>
        </div>
      </div>
      <div class="toast-actions">
        <button class="button button-accent" data-action="analyze" type="button">Analisar</button>
        <button class="button button-primary" data-action="fill" type="button">Preencher campo</button>
        <button class="button button-ghost" data-action="ignore" type="button">Ignorar</button>
      </div>
    `;

    document.body.appendChild(toastEl);

    // Animação de entrada
    requestAnimationFrame(() => {
      if (toastEl) toastEl.classList.add('visible');
    });

    // Event listeners
    toastEl.querySelector('[data-action="analyze"]').addEventListener('click', () => {
      if (typeof onAnalyze === 'function') onAnalyze(url);
      dismiss();
    });

    toastEl.querySelector('[data-action="fill"]').addEventListener('click', () => {
      if (typeof onFillOnly === 'function') onFillOnly(url);
      dismiss();
    });

    toastEl.querySelector('[data-action="ignore"]').addEventListener('click', () => {
      window.api.clipboardIgnoreUrl(url).catch(() => {});
      dismiss();
    });

    // Auto-dismiss após 15s
    autoDismissTimer = setTimeout(() => dismiss(), 15000);
  }

  function dismiss() {
    if (autoDismissTimer) {
      clearTimeout(autoDismissTimer);
      autoDismissTimer = null;
    }
    if (toastEl) {
      toastEl.classList.remove('visible');
      toastEl.addEventListener('transitionend', () => {
        if (toastEl && toastEl.parentNode) {
          toastEl.parentNode.removeChild(toastEl);
        }
        toastEl = null;
      }, { once: true });
      // Fallback: remove após 300ms se transitionend não disparar
      setTimeout(() => {
        if (toastEl && toastEl.parentNode) {
          toastEl.parentNode.removeChild(toastEl);
        }
        toastEl = null;
      }, 350);
    }
  }

  function destroy() {
    dismiss();
  }

  return { show, dismiss, destroy };
}

function truncateUrl(url, maxLen) {
  if (url.length <= maxLen) return url;
  const half = Math.floor(maxLen / 2);
  return `${url.slice(0, half - 2)}...${url.slice(-(half - 1))}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}