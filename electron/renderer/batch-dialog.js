/**
 * BatchDialog — Modal de download em lote (múltiplas URLs).
 *
 * SPEC-03: docs/specs/03-download-em-lote.md
 */

const MAX_BATCH_URLS = 100;

/** Extrai URLs de um texto livre (linhas, vírgulas, espaços). */
function parseBatchUrls(rawText) {
  if (typeof rawText !== 'string') return [];
  const seen = new Set();
  const out = [];
  for (const chunk of rawText.split(/[\n\r,;\s]+/)) {
    const url = chunk.trim();
    if (!url) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

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

    modalEl.innerHTML = `
      <div class="batch-modal">
        <div class="batch-header">
          <h2>📦 Download em Lote</h2>
          <button class="button button-ghost" data-action="close" type="button">✕</button>
        </div>
        <div class="batch-body">
          <label class="batch-field">
            <span class="batch-label">Cole as URLs (uma por linha):</span>
            <textarea class="batch-textarea" data-field="urls"
              placeholder="https://youtube.com/watch?v=abc&#10;https://exemplo.com/video.m3u8&#10;https://instagram.com/reel/xyz"></textarea>
          </label>

          <div class="batch-options">
            <div class="batch-option-row">
              <label class="batch-field batch-field-inline">
                <span class="batch-label">Pasta de saída:</span>
                <div class="inline-row">
                  <input data-field="outputDir" placeholder="Downloads" />
                  <button class="button button-ghost" data-action="pickDir" type="button">Escolher</button>
                </div>
              </label>
            </div>
            <label class="toggle">
              <input data-field="turbo" type="checkbox" />
              <span>⚡ Turbo — download paralelo por partes</span>
            </label>
          </div>

          <div class="batch-summary" data-field="summary">
            Cole as URLs acima. Cada vídeo será analisado e adicionado à fila.
          </div>

          <div class="batch-progress" data-field="progress" hidden></div>
        </div>
        <div class="batch-footer">
          <button class="button button-ghost" data-action="cancel" type="button">Cancelar</button>
          <button class="button button-accent" data-action="start" type="button">Analisar e enfileirar</button>
        </div>
      </div>
    `;

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

  function appendProgress(container, data) {
    if (!container) return;
    const row = document.createElement('div');
    row.className = `batch-progress-item ${data.status === 'enqueued' ? 'success' : data.status === 'error' ? 'error' : 'pending'}`;

    const icon = data.status === 'enqueued' ? '✅' : data.status === 'error' ? '❌' : '⏳';
    const label = data.status === 'analyzing'
      ? 'analisando...'
      : data.status === 'enqueued'
        ? `Fila #${data.jobId || '?'}`
        : data.error || 'erro';

    row.innerHTML = `
      <span class="batch-progress-icon">${icon}</span>
      <span class="batch-progress-url">${escapeHtml(truncate(data.url, 60))}</span>
      <span class="batch-progress-status">${escapeHtml(label)}</span>
    `;
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
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

function truncate(text, max) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max - 3)}...`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}