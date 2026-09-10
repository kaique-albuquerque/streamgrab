/**
 * Batch download — processa múltiplas URLs em sequência.
 *
 * SPEC-03: docs/specs/03-download-em-lote.md
 *
 * Módulo puro (sem dependência de Electron): recebe as funções de análise
 * e enfileiramento por injeção, permitindo reuso no CLI e no Electron.
 */

export const MAX_BATCH_URLS = 100;
const ANALYZE_TIMEOUT_MS = 30000;

/**
 * Extrai URLs de um texto livre (uma por linha, separadas por vírgula/espaço).
 * Remove duplicatas e entradas vazias.
 */
export function parseBatchUrls(rawText) {
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

/**
 * Processa uma lista de URLs: valida, analisa e enfileira cada uma.
 *
 * @param {object} opts
 * @param {string[]} opts.urls — URLs a processar
 * @param {string} opts.outputDir — pasta de destino (opcional)
 * @param {object} opts.options — opções repassadas ao enqueue (turbo, etc)
 * @param {Function} opts.analyze — async (url) => info | null
 * @param {Function} opts.enqueue — async ({ url, filename, title, outputDir, options }) => job
 * @param {Function} [opts.onProgress] — callback({ url, status, jobId?, error?, title? })
 * @param {Function} [opts.sanitizeFilename] — normalizador de nome de arquivo
 * @returns {Promise<{ results: Array, ok: number, failed: number }>}
 */
export async function processBatch({ urls, outputDir = '', options = {}, analyze, enqueue, onProgress, sanitizeFilename }) {
  if (!Array.isArray(urls) || urls.length === 0) {
    return { results: [], ok: 0, failed: 0, error: 'Nenhuma URL fornecida.' };
  }

  const list = urls.slice(0, MAX_BATCH_URLS);
  const results = [];

  for (const url of list) {
    const result = { url, status: 'pending', jobId: null, error: null, title: '' };

    try {
      onProgress?.({ url, status: 'analyzing' });

      if (!/^https?:\/\//i.test(url)) {
        throw new Error('URL inválida (deve iniciar com http:// ou https://).');
      }

      // 1. Analisa (com timeout) para obter título/metadados
      let info = null;
      try {
        info = await withTimeout(Promise.resolve(analyze(url)), ANALYZE_TIMEOUT_MS);
      } catch (analyzeErr) {
        // Falha na análise não impede o enfileiramento: a fila re-analisa.
        result.analysisError = analyzeErr?.message || 'Falha na análise';
      }

      const media = info?.media || info || {};
      const title = media.title || info?.title || '';
      const baseName = buildFilename({ title, url, sanitizeFilename });

      // 2. Enfileira
      const job = await enqueue({
        url: info?.workingUrl || url,
        filename: baseName,
        title: title || baseName,
        outputDir,
        options,
      });

      result.status = 'enqueued';
      result.jobId = job?.id || job?.jobId || null;
      result.title = title;

      onProgress?.({ url, status: 'enqueued', jobId: result.jobId, title });
    } catch (err) {
      result.status = 'error';
      result.error = err?.message || 'Erro desconhecido';
      onProgress?.({ url, status: 'error', error: result.error });
    }

    results.push(result);
  }

  const ok = results.filter((r) => r.status === 'enqueued').length;
  return { results, ok, failed: results.length - ok, truncated: urls.length > MAX_BATCH_URLS };
}

/** Gera um nome de arquivo a partir do título ou do path da URL. */
export function buildFilename({ title, url, sanitizeFilename }) {
  const sanitize = typeof sanitizeFilename === 'function' ? sanitizeFilename : defaultSanitize;
  let base = String(title || '').trim();

  if (!base) {
    try {
      const pathname = new URL(url).pathname || '';
      const last = pathname.split('/').filter(Boolean).pop() || '';
      base = decodeURIComponent(last.replace(/\.[a-z0-9]{1,6}$/i, '')) || 'video';
    } catch {
      base = 'video';
    }
  }

  const clean = sanitize(base) || 'video';
  return clean.toLowerCase().endsWith('.mp4') ? clean : `${clean}.mp4`;
}

function defaultSanitize(value) {
  return String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[.\s]+$/g, '')
    .replace(/^[.\s]+/g, '');
}

function withTimeout(promise, ms) {
  let timer = null;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout na análise (${Math.round(ms / 1000)}s)`)), ms);
    }),
  ]);
}