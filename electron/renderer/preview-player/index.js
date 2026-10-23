/**
 * PreviewPlayer — Modal com player para conferir o vídeo antes de baixar.
 *
 * SPEC-06: docs/specs/06-preview-de-midia.md
 */

import { createOverlay } from './overlay.js';
import { renderPreview } from './media.js';

export function createPreviewPlayer({ api }) {
  let modalEl = null;
  let currentFilePath = null;
  let currentBlobUrl = null;
  let onDownloadCb = null;

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

  async function open({ url, sourceType, quality, title, onDownload }) {
    if (modalEl) close();

    onDownloadCb = typeof onDownload === 'function' ? onDownload : null;

    modalEl = createOverlay({
      title,
      onClose: close,
      onDownload: () => {
        if (onDownloadCb) onDownloadCb();
        close();
      },
    });

    let result;
    try {
      result = await api.generatePreview({ url, sourceType, quality });
    } catch (err) {
      result = { ok: false, error: err?.message || 'Erro de comunicação com o processador principal.' };
    }

    if (!modalEl) return; // fechado durante a geração

    const rendered = await renderPreview({ api, modalEl, result });
    if (rendered.filePath !== undefined) currentFilePath = rendered.filePath;
    if ('blobUrl' in rendered) currentBlobUrl = rendered.blobUrl;
  }

  return { open, close, isOpen };
}
