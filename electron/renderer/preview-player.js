/**
 * PreviewPlayer — Modal com player para conferir o vídeo antes de baixar.
 *
 * SPEC-06: docs/specs/06-preview-de-midia.md
 */

export function createPreviewPlayer({ api }) {
  let modalEl = null;
  let currentFilePath = null;
  let currentBlobUrl = null;
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

    let result;
    try {
      result = await api.generatePreview({ url, sourceType, quality });
    } catch (err) {
      result = { ok: false, error: err?.message || 'Erro de comunicação com o processador principal.' };
    }

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

    // Lê o arquivo como buffer e cria um blob URL — evita problemas
    // com file:// no sandbox do Electron.
    let blobUrl = null;
    try {
      const fileData = await api.readPreviewFile(result.filePath);
      if (fileData?.ok && fileData.data) {
        const binary = atob(fileData.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: fileData.mimeType || 'video/mp4' });
        blobUrl = URL.createObjectURL(blob);
      }
    } catch {
      // Se a leitura falhar, tenta file:// como fallback.
      blobUrl = result.srcUrl || null;
    }

    // Armazena para limpeza no close().
    currentBlobUrl = blobUrl;

    if (!blobUrl) {
      stage.hidden = true;
      messageEl.hidden = false;
      messageEl.className = 'preview-message error';
      messageEl.textContent = '⚠️ Não foi possível ler o arquivo de preview.';
      return;
    }

    const video = document.createElement('video');
    video.className = 'preview-video';
    video.controls = true;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    // Exibe o spinner do app até o primeiro frame estar pronto.
    // Se o browser não emitir 'loadeddata' dentro de 15s, mostramos erro.
    const LOAD_TIMEOUT_MS = 15000;
    const loadTimer = setTimeout(() => {
      if (video.readyState < 2) { // < HAVE_CURRENT_DATA
        video.src = '';
        video.load();
        stage.hidden = true;
        messageEl.hidden = false;
        messageEl.className = 'preview-message error';
        messageEl.textContent = '⚠️ O vídeo demorou para carregar. O arquivo pode estar corrompido ou incompatível.';
      }
    }, LOAD_TIMEOUT_MS);

    video.addEventListener('loadeddata', () => {
      clearTimeout(loadTimer);
    }, { once: true });

    video.addEventListener('error', () => {
      clearTimeout(loadTimer);
      if (blobUrl && blobUrl.startsWith('blob:')) URL.revokeObjectURL(blobUrl);
      stage.hidden = true;
      messageEl.hidden = false;
      messageEl.className = 'preview-message error';
      messageEl.textContent = '⚠️ O navegador não conseguiu reproduzir este trecho. Tente baixar diretamente.';
    }, { once: true });

    video.src = blobUrl;

    stage.innerHTML = '';
    stage.appendChild(video);
    downloadBtn.disabled = false;

    if (result.cached) {
      const hint = modalEl.querySelector('.preview-hint');
      if (hint) hint.textContent = 'Trecho em cache — carregado instantaneamente.';
    }
  }

  function close() {
    if (currentBlobUrl && currentBlobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = null;
    }
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