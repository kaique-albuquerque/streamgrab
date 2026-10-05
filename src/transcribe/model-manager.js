/**
 * Gerenciamento do modelo GGML do whisper.cpp para o app.
 *
 * Em produção o instalador traz apenas o binário whisper-cli
 * (scripts/package-resources.mjs). O modelo (~244 MB) é baixado na
 * primeira execução para um diretório gravável (userData/whisper/models),
 * pois o diretório do instalador é read-only.
 *
 * Download com retomada (HTTP Range): um arquivo .part é mantido entre
 * tentativas e renomeado apenas após verificação de integridade por tamanho.
 *
 * Uso:
 *   const status = getModelStatus(modelsDir);
 *   await downloadModel({ modelsDir, onProgress, signal });
 */
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const DEFAULT_MODEL = 'small';

/** Catálogo de modelos suportados (espelha MODEL_MAP em whisper-cpp.js). */
export const MODEL_CATALOG = {
  small: {
    fileName: 'ggml-small.bin',
    label: 'small',
    expectedSize: 244_000_000,
    minSize: 244_000_000 * 0.9,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
  },
};

const PROGRESS_MIN_INTERVAL_MS = 250;

/**
 * Status do modelo em `modelsDir`.
 *
 * @param {string} modelsDir - Diretório onde o modelo deve residir
 * @param {string} [model='small'] - Chave do catálogo
 * @returns {{ installed: boolean, model: string, fileName: string, path: string,
 *             size: number, expectedSize: number, percent: number, partialSize: number }}
 */
export function getModelStatus(modelsDir, model = DEFAULT_MODEL) {
  const info = MODEL_CATALOG[model];
  if (!info) {
    return {
      installed: false,
      model,
      fileName: '',
      path: '',
      size: 0,
      expectedSize: 0,
      percent: 0,
      partialSize: 0,
      error: `Modelo desconhecido: ${model}. Opções: ${Object.keys(MODEL_CATALOG).join(', ')}`,
    };
  }

  const modelPath = path.join(modelsDir, info.fileName);
  const partPath = `${modelPath}.part`;

  const sizeOf = (p) => {
    try {
      if (fs.existsSync(p)) return fs.statSync(p).size;
    } catch {
      /* ignora */
    }
    return 0;
  };

  const size = sizeOf(modelPath);
  const partialSize = sizeOf(partPath);
  const installed = size >= info.minSize;

  return {
    installed,
    model,
    fileName: info.fileName,
    path: modelPath,
    size,
    expectedSize: info.expectedSize,
    percent: installed ? 100 : Math.min(99, Math.round((partialSize / info.expectedSize) * 100)),
    partialSize,
  };
}

/**
 * Baixa o modelo para `modelsDir` com retomada e progresso.
 *
 * - Se já instalado, retorna status imediatamente.
 * - Download parcial fica em `<modelo>.part` e é retomado via HTTP Range.
 * - Integridade verificada por tamanho mínimo (~90% do esperado).
 *
 * @param {object} params
 * @param {string} params.modelsDir - Diretório de destino
 * @param {string} [params.model='small'] - Chave do catálogo
 * @param {Function} [params.onProgress] - Callback de progresso
 * @param {AbortSignal} [params.signal] - Sinal de cancelamento
 * @param {typeof fetch} [params.fetchImpl] - fetch injetável (testes)
 * @returns {Promise<ReturnType<typeof getModelStatus>>}
 */
export async function downloadModel({
  modelsDir,
  model = DEFAULT_MODEL,
  onProgress,
  signal,
  fetchImpl = globalThis.fetch,
} = {}) {
  const info = MODEL_CATALOG[model];
  if (!info) {
    throw new Error(`Modelo desconhecido: ${model}. Opções: ${Object.keys(MODEL_CATALOG).join(', ')}`);
  }

  const status = getModelStatus(modelsDir, model);
  if (status.installed) return status;

  fs.mkdirSync(modelsDir, { recursive: true });

  const modelPath = status.path;
  const partPath = `${modelPath}.part`;

  // Retomada: se o .part já cobre o tamanho mínimo, só valida e renomeia.
  if (status.partialSize >= info.minSize) {
    fs.renameSync(partPath, modelPath);
    return getModelStatus(modelsDir, model);
  }

  let downloaded = status.partialSize;
  const headers = downloaded > 0 ? { Range: `bytes=${downloaded}-` } : {};
  const response = await fetchImpl(info.url, { headers, redirect: 'follow', signal });

  if (!response.ok && response.status !== 206) {
    throw new Error(`Download do modelo falhou: HTTP ${response.status} ${response.statusText}`);
  }

  // Servidor ignorou o Range (respondeu 200 em vez de 206) — recomeça do zero.
  if (downloaded > 0 && response.status === 200) {
    downloaded = 0;
  }

  if (!response.body) {
    throw new Error('Resposta do download sem corpo streaming.');
  }

  const contentLength = Number(response.headers.get('content-length')) || 0;
  const total = response.status === 206 ? downloaded + contentLength : contentLength || info.expectedSize;

  const fileStream = fs.createWriteStream(partPath, { flags: downloaded > 0 ? 'a' : 'w' });
  // fetch real retorna web ReadableStream; aceita também Node Readable (testes).
  const body = response.body;
  const nodeStream = typeof body.pipe === 'function' ? body : Readable.fromWeb(body);

  let lastPercent = -1;
  let lastEmitAt = 0;

  nodeStream.on('data', (chunk) => {
    downloaded += chunk.length;
    const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
    const now = Date.now();
    if (percent !== lastPercent && (now - lastEmitAt >= PROGRESS_MIN_INTERVAL_MS || percent === 100)) {
      lastPercent = percent;
      lastEmitAt = now;
      onProgress?.({ stage: 'downloading', percent, downloaded, total, file: info.fileName });
    }
  });

  try {
    await pipeline(nodeStream, fileStream);
  } catch (err) {
    if (signal?.aborted) {
      const cancelled = new Error('Download do modelo cancelado.');
      cancelled.cancelled = true;
      throw cancelled;
    }
    // .part é preservado para retomada na próxima tentativa.
    throw err;
  }

  // Integridade por tamanho (mesma abordagem do install-whisper.mjs).
  const finalSize = fs.statSync(partPath).size;
  if (finalSize < info.minSize) {
    throw new Error(
      `Modelo baixado parece incompleto (${formatSize(finalSize)} de ~${formatSize(info.expectedSize)}). ` +
        'Execute o download novamente.'
    );
  }

  fs.renameSync(partPath, modelPath);
  onProgress?.({ stage: 'done', percent: 100, downloaded: finalSize, total: finalSize, file: info.fileName });

  return getModelStatus(modelsDir, model);
}

function formatSize(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

export default downloadModel;
