/** Markup e montagem do overlay do preview. */

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Cria o overlay do modal (já anexado ao body) e liga fechar/baixar/ESC. */
export function createOverlay({ title, onClose, onDownload }) {
  const modalEl = document.createElement('div');
  modalEl.className = 'preview-overlay';
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) onClose();
  });

  modalEl.innerHTML = `
      <div class="preview-modal">
        <div class="preview-header">
          <h2>▶ Preview — ${escapeHtml(title || 'Vídeo')}</h2>
          <button class="button button-ghost" data-action="close" type="button">✕</button>
        </div>
        <div class="preview-body">
          <div class="preview-stage" data-field="stage">
            <div class="preview-spinner">
              <div class="spinner"></div>
              <p>Gerando preview (até 60s do vídeo)...</p>
            </div>
          </div>
          <div class="preview-message" data-field="message" hidden></div>
        </div>
        <div class="preview-footer">
          <span class="preview-hint">Trecho de demonstração — o download completo terá a duração total.</span>
          <div class="preview-actions">
            <button class="button button-ghost" data-action="close2" type="button">Fechar</button>
            <button class="button button-accent" data-action="download" type="button" disabled>⬇ Baixar agora</button>
          </div>
        </div>
      </div>
    `;

  document.body.appendChild(modalEl);

  modalEl.querySelector('[data-action="close"]').addEventListener('click', onClose);
  modalEl.querySelector('[data-action="close2"]').addEventListener('click', onClose);
  modalEl.querySelector('[data-action="download"]').addEventListener('click', onDownload);

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      onClose();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  return modalEl;
}
