/**
 * PreviewPlayer — Modal com player para conferir o vídeo antes de baixar.
 *
 * SPEC-06: docs/specs/06-preview-de-midia.md
 */

export function createPreviewPlayer({ api }) {
  let modalEl = null;
  let currentFilePath = null;
  let onDownloadCb = null;

  async function open({ url, sourceType, quality, title, onDownload }) {
    if (modalEl) close();

    onDownloadCb = typeof onDownload === 'function' ? onDownload : null;

    modalEl = document.createElement('div');
    modalEl.className = 'preview-overlay';
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) close();
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

    modalEl.querySelector('[data-action="close"]').addEventListener('click', close);
    modalEl.querySelector('[data-action="close2"]').addEventListener('click', close);
    modalEl.querySelector('[data-action="download"]').addEventListener('click', () => {
      if (onDownloadCb) onDownloadCb();
      close();
    });

    const escHandler = (e) => {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    const result = await api.generatePreview({ url, sourceType, quality });

    if (!modalEl) return; // fechado durante a geração

    const stage = modalEl.querySelector('[data-field="stage"]');
    const messageEl = modalEl.querySelector('[data-field="message"]');
    const downloadBtn = modalEl.querySelector('[data-action="download"]');

    if (!result?.ok) {
      stage.hidden = true;
      messageEl.hidden = false;
      messageEl.className = 'preview-message error';
      messageEl.textContent = `⚠️ ${result?.error || 'Não foi possível gerar o preview.'}`;
      return;
    }

    currentFilePath = result.filePath || null;

    const video = document.createElement('video');
    video.className = 'preview-video';
    video.controls = true;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.src = result.srcUrl;
    video.addEventListener('error', () => {
      stage.hidden = true;
      messageEl.hidden = false;
      messageEl.className = 'preview-message error';
      messageEl.textContent = '⚠️ O navegador não conseguiu reproduzir este trecho. Tente baixar diretamente.';
    });

    stage.innerHTML = '';
    stage.appendChild(video);
    downloadBtn.disabled = false;

    if (result.cached) {
      const hint = modalEl.querySelector('.preview-hint');
      if (hint) hint.textContent = 'Trecho em cache — carregado instantaneamente.';
    }
  }

  function close() {
    if (currentFilePath) {
      api.clearPreview(currentFilePath).catch(() => {});
      currentFilePath = null;
    }
    if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
    modalEl = null;
    onDownloadCb = null;
  }

  function isOpen() {
    return Boolean(modalEl);
  }

  return { open, close, isOpen };
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}