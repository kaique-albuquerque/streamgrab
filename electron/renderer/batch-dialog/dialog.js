import { MAX_BATCH_URLS, parseBatchUrls } from './urls.js';
import { MODAL_HTML } from './template.js';
import { appendProgress } from './dom.js';
import { collectNames, renderNameFields } from './names.js';

export function createBatchDialog({ api, onEnqueued, getDefaultOutputDir }) {
  let modalEl = null;
  let progressEl = null;
  let namesEl = null;
  /** Nomes digitados por URL (sobrevive ao re-render da lista). */
  const nameByUrl = new Map();

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
    const audioField = modalEl.querySelector('[data-field="audioExtract"]');
    const summaryEl = modalEl.querySelector('[data-field="summary"]');
    progressEl = modalEl.querySelector('[data-field="progress"]');
    namesEl = modalEl.querySelector('[data-field="names"]');

    outputDirField.value = getDefaultOutputDir ? getDefaultOutputDir() || '' : '';

    // Reflete a configuração atual como ponto de partida (mudar aqui afeta
    // só este lote; a Configurações continua intacta).
    api.settingsGet?.().then((settings) => {
      const current = settings?.audioExtract;
      if (audioField && ['off', 'm4a', 'mp3'].includes(current)) audioField.value = current;
    }).catch(() => {});

    // Atualiza o contador de URLs e a lista de nomes enquanto digita
    urlsField.addEventListener('input', () => {
      const urls = parseBatchUrls(urlsField.value);
      renderNameFields(namesEl, urls, nameByUrl);
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
      await runBatch({
        urls,
        names: collectNames(namesEl),
        outputDir: outputDirField.value.trim(),
        turbo: turboField.checked,
        audioExtract: audioField?.value || 'off',
        summaryEl,
      });
    });
  }

  async function runBatch({ urls, names, outputDir, turbo, audioExtract, summaryEl }) {
    const startBtn = modalEl.querySelector('[data-action="start"]');
    startBtn.disabled = true;
    startBtn.textContent = 'Processando...';
    if (progressEl) {
      progressEl.hidden = false;
      progressEl.innerHTML = '';
    }
    summaryEl.classList.remove('error');

    const result = await safeBatchEnqueue({ urls, names, outputDir, turbo, audioExtract });

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
    const firstError = (result?.results || []).find((r) => r.status === 'error');
    let text = `✅ ${ok} enfileirado${ok !== 1 ? 's' : ''}${failed > 0 ? ` · ❌ ${failed} com erro` : ''}`;
    if (ok > 0) text += ' · acompanhe na aba Fila';
    if (firstError?.error) text += ` — ${firstError.error}`;
    summaryEl.textContent = text;
    if (failed > 0) summaryEl.classList.add('error');

    if (typeof onEnqueued === 'function') onEnqueued(result);
  }

  /** Envolve o IPC para que uma rejeição não deixe o modal travado. */
  async function safeBatchEnqueue(payload) {
    try {
      return await api.batchEnqueue(payload);
    } catch (err) {
      return { error: `Falha ao enfileirar: ${err?.message || err}` };
    }
  }

  function close() {
    if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
    modalEl = null;
    progressEl = null;
    namesEl = null;
    nameByUrl.clear();
  }

  function isOpen() {
    return Boolean(modalEl);
  }

  return { open, close, isOpen };
}
