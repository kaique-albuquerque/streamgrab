import { MAX_BATCH_URLS, parseBatchUrls } from './urls.js';
import { MODAL_HTML } from './template.js';
import { appendProgress } from './dom.js';

export function createBatchDialog({ api, onEnqueued, getDefaultOutputDir }) {
  let modalEl = null;
  let progressEl = null;

  // Registra o listener de progresso UMA vez (evita acúmulo a cada open()).
  api.onBatchProgress((data) => {
    if (progressEl) appendProgress(progressEl, data);
  });

  function open() {
    if (modalEl) return;

    modalEl = document.createElement('div');
    modalEl.className = 'batch-overlay';
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) close();
    });

    modalEl.innerHTML = MODAL_HTML;

    document.body.appendChild(modalEl);

    const urlsField = modalEl.querySelector('[data-field="urls"]');
    const outputDirField = modalEl.querySelector('[data-field="outputDir"]');
    const turboField = modalEl.querySelector('[data-field="turbo"]');
    const summaryEl = modalEl.querySelector('[data-field="summary"]');
    progressEl = modalEl.querySelector('[data-field="progress"]');

    outputDirField.value = getDefaultOutputDir ? getDefaultOutputDir() || '' : '';

    // Atualiza o contador de URLs enquanto digita
    urlsField.addEventListener('input', () => {
      const urls = parseBatchUrls(urlsField.value);
      const count = urls.length;
      if (count === 0) {
        summaryEl.textContent = 'Cole as URLs acima. Cada vídeo será analisado e adicionado à fila.';
        summaryEl.classList.remove('error');
      } else if (count > MAX_BATCH_URLS) {
        summaryEl.textContent = `⚠️ ${count} URLs detectadas — apenas as primeiras ${MAX_BATCH_URLS} serão processadas.`;
        summaryEl.classList.add('error');
      } else {
        summaryEl.textContent = `${count} URL${count > 1 ? 's' : ''} detectada${count > 1 ? 's' : ''}. Máximo de ${MAX_BATCH_URLS} por lote.`;
        summaryEl.classList.remove('error');
      }
    });

    modalEl.querySelector('[data-action="close"]').addEventListener('click', close);
    modalEl.querySelector('[data-action="cancel"]').addEventListener('click', close);

    modalEl.querySelector('[data-action="pickDir"]').addEventListener('click', async () => {
      const dir = await api.pickOutputDir();
      if (dir) outputDirField.value = dir;
    });

    modalEl.querySelector('[data-action="start"]').addEventListener('click', async () => {
      const urls = parseBatchUrls(urlsField.value);
      if (urls.length === 0) {
        summaryEl.textContent = '⚠️ Nenhuma URL válida encontrada.';
        summaryEl.classList.add('error');
        return;
      }
      await runBatch({ urls, outputDir: outputDirField.value.trim(), turbo: turboField.checked, summaryEl });
    });
  }

  async function runBatch({ urls, outputDir, turbo, summaryEl }) {
    const startBtn = modalEl.querySelector('[data-action="start"]');
    startBtn.disabled = true;
    startBtn.textContent = 'Processando...';
    if (progressEl) {
      progressEl.hidden = false;
      progressEl.innerHTML = '';
    }
    summaryEl.classList.remove('error');

    const result = await api.batchEnqueue({ urls, outputDir, turbo });

    // A modal pode ter sido fechada durante o processamento
    if (!modalEl) return;
    startBtn.disabled = false;
    startBtn.textContent = 'Analisar e enfileirar';

    if (result?.error) {
      summaryEl.textContent = `⚠️ ${result.error}`;
      summaryEl.classList.add('error');
      return;
    }

    const ok = result?.ok ?? 0;
    const failed = result?.failed ?? 0;
    summaryEl.textContent = `✅ ${ok} enfileirado${ok !== 1 ? 's' : ''}${failed > 0 ? ` · ❌ ${failed} com erro` : ''}`;
    if (failed > 0) summaryEl.classList.add('error');

    if (typeof onEnqueued === 'function') onEnqueued(result);
  }

  function close() {
    if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
    modalEl = null;
    progressEl = null;
  }

  function isOpen() {
    return Boolean(modalEl);
  }

  return { open, close, isOpen };
}
