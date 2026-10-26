/**
 * Carregamento do vídeo de preview: blob URL, estados de erro e player.
 */

const LOAD_TIMEOUT_MS = 15000;

function showError(stage, messageEl, text) {
  stage.hidden = true;
  messageEl.hidden = false;
  messageEl.className = 'preview-message error';
  messageEl.textContent = text;
}

/** Lê o arquivo de preview e devolve um blob URL (ou o srcUrl de fallback). */
async function loadBlobUrl(api, result) {
  try {
    const fileData = await api.readPreviewFile(result.filePath);
    if (fileData?.ok && fileData.data) {
      const binary = atob(fileData.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: fileData.mimeType || 'video/mp4' });
      return URL.createObjectURL(blob);
    }
  } catch {
    // Se a leitura falhar, tenta file:// como fallback.
    return result.srcUrl || null;
  }
  return null;
}

function mountVideo({ stage, messageEl, downloadBtn, blobUrl }) {
  const video = document.createElement('video');
  video.className = 'preview-video';
  video.controls = true;
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  // Exibe o spinner do app até o primeiro frame estar pronto.
  const loadTimer = setTimeout(() => {
    if (video.readyState < 2) { // < HAVE_CURRENT_DATA
      video.src = '';
      video.load();
      showError(stage, messageEl, '⚠️ O vídeo demorou para carregar. O arquivo pode estar corrompido ou incompatível.');
    }
  }, LOAD_TIMEOUT_MS);

  video.addEventListener('loadeddata', () => {
    clearTimeout(loadTimer);
  }, { once: true });

  video.addEventListener('error', () => {
    clearTimeout(loadTimer);
    if (blobUrl && blobUrl.startsWith('blob:')) URL.revokeObjectURL(blobUrl);
    showError(stage, messageEl, '⚠️ O navegador não conseguiu reproduzir este trecho. Tente baixar diretamente.');
  }, { once: true });

  video.src = blobUrl;

  stage.innerHTML = '';
  stage.appendChild(video);
  downloadBtn.disabled = false;
}

/**
 * Renderiza o resultado de generatePreview no modal.
 * @returns {Promise<{filePath: string|null, blobUrl: string|null}>}
 */
export async function renderPreview({ api, modalEl, result }) {
  const stage = modalEl.querySelector('[data-field="stage"]');
  const messageEl = modalEl.querySelector('[data-field="message"]');
  const downloadBtn = modalEl.querySelector('[data-action="download"]');

  if (!result?.ok) {
    showError(stage, messageEl, `⚠️ ${result?.error || 'Não foi possível gerar o preview.'}`);
    return {};
  }

  const filePath = result.filePath || null;
  const blobUrl = await loadBlobUrl(api, result);
  if (!blobUrl) {
    showError(stage, messageEl, '⚠️ Não foi possível ler o arquivo de preview.');
    return { filePath, blobUrl: null };
  }

  mountVideo({ stage, messageEl, downloadBtn, blobUrl });

  if (result.cached) {
    const hint = modalEl.querySelector('.preview-hint');
    if (hint) hint.textContent = 'Trecho em cache — carregado instantaneamente.';
  }

  return { filePath, blobUrl };
}
