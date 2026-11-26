/**
 * Painel de conversão de vídeo para MKV (card na aba Transcrever).
 *
 * Consome `window.api.convert*` e reflete o estado via eventos. A conversão
 * roda no main process; este painel apenas espelha o progresso.
 */

/** Normaliza o percentual para 0..100. */
function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

/**
 * Cria o painel de conversão.
 *
 * @param {object} [deps]
 * @param {object} [deps.api] - API do preload (default: window.api)
 * @param {object} [deps.doc] - Documento (default: document)
 */
export function createConvertPanel({ api, doc } = {}) {
  // Aceita tanto a função `() => window.api` quanto o objeto direto.
  const apiFn = typeof api === 'function' ? api : () => api || window.api;
  const docRef = doc || (typeof document !== 'undefined' ? document : null);
  let jobId = null;

  function hint(text, isError = false) {
    const el = docRef?.getElementById('convertHint');
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
    el.style.color = isError ? 'var(--danger)' : '';
  }

  function setPercent(percent) {
    const el = docRef?.getElementById('convertPercent');
    if (el) el.textContent = `${clampPercent(percent)}%`;
  }

  async function start() {
    const inputPath = await apiFn().pickMediaFile();
    if (!inputPath) return;

    hint('Convertendo...');
    setPercent(0);

    const res = await apiFn().convertStart({ inputPath });
    if (!res?.ok) {
      hint(res?.error?.message || 'Falha na conversão.', true);
      return;
    }
    jobId = res.jobId || jobId;
    hint('');
  }

  async function cancel() {
    if (!jobId) return;
    await apiFn().convertCancel(jobId).catch(() => {});
  }

  function handleEvent(type, data) {
    if (type === 'progress') {
      if (data?.jobId && jobId && data.jobId !== jobId) return;
      setPercent(data?.percent);
      return;
    }
    if (type === 'done') {
      setPercent(100);
      hint(`Conversão concluída: ${data?.outputPath || ''}`);
      return;
    }
    if (type === 'error') {
      hint(data?.error || 'Falha na conversão.', true);
    }
  }

  return { start, cancel, handleEvent };
}