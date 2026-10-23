/**
 * Download de modelos com retomada (HTTP Range), progresso e verificação.
 *
 * Um arquivo .part é mantido entre tentativas e renomeado apenas após a
 * verificação de tamanho e SHA-256.
 */

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DEFAULT_MODEL, getModelEntry, unknownModelError } from './catalog.js';
import { writeMarker } from './marker.js';
import { getModelStatus } from './status.js';
import { hashExisting, verifyIntegrity } from './integrity.js';
import { createProgressEmitter } from './progress.js';

/**
 * Baixa um modelo do catálogo para `modelsDir` com retomada e progresso.
 *
 * - Se já instalado, retorna status imediatamente.
 * - Download parcial fica em `<modelo>.part` e é retomado via HTTP Range.
 * - Integridade verificada por tamanho mínimo e, quando o catálogo traz
 *   `sha256`, pelo hash SHA-256 do arquivo completo (calculado durante a
 *   própria gravação, sem reler o arquivo).
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
  const info = getModelEntry(model);
  if (!info) throw unknownModelError(model);

  const status = getModelStatus(modelsDir, model);
  if (status.installed) return status;

  fs.mkdirSync(modelsDir, { recursive: true });

  const modelPath = status.path;
  const partPath = `${modelPath}.part`;

  // Retomada: se o .part já cobre o tamanho mínimo, só valida e renomeia.
  const resumed = await finishFromExistingPart(modelsDir, model, info, status);
  if (resumed) return resumed;

  let downloaded = status.partialSize;
  // Hash incremental: retoma a partir do prefixo já baixado em vez de reler
  // o arquivo inteiro no final (economiza gigabytes em modelos grandes).
  let hash = info.sha256 ? createHash('sha256') : null;
  if (hash && downloaded > 0) await hashExisting(partPath, hash, downloaded);

  const headers = downloaded > 0 ? { Range: `bytes=${downloaded}-` } : {};
  const response = await fetchImpl(info.url, { headers, redirect: 'follow', signal });

  if (!response.ok && response.status !== 206) {
    throw new Error(`Download do modelo falhou: HTTP ${response.status} ${response.statusText}`);
  }

  // Servidor ignorou o Range (respondeu 200 em vez de 206) — recomeça do zero.
  if (downloaded > 0 && response.status === 200) {
    downloaded = 0;
    hash = info.sha256 ? createHash('sha256') : null;
  }

  if (!response.body) {
    throw new Error('Resposta do download sem corpo streaming.');
  }

  const contentLength = Number(response.headers.get('content-length')) || 0;
  const total = response.status === 206 ? downloaded + contentLength : contentLength || info.expectedSize;
  const emitProgress = createProgressEmitter(onProgress, { model, file: info.fileName, total });

  const fileStream = fs.createWriteStream(partPath, { flags: downloaded > 0 ? 'a' : 'w' });
  const nodeStream = toNodeStream(response.body);

  nodeStream.on('data', (chunk) => {
    downloaded += chunk.length;
    hash?.update(chunk);
    emitProgress(downloaded);
  });

  await pipelineOrCancel(nodeStream, fileStream, signal);
  await verifyIntegrity(partPath, info, model, hash);

  const finalSize = fs.statSync(partPath).size;
  fs.renameSync(partPath, modelPath);
  writeMarker(modelPath, info.sha256);
  onProgress?.({ stage: 'done', percent: 100, downloaded: finalSize, total: finalSize, model, file: info.fileName });

  return getModelStatus(modelsDir, model);
}

/**
 * Promove um `.part` já completo para o arquivo final (retomada finalizada).
 *
 * @returns {Promise<ReturnType<typeof getModelStatus> | null>} Status final ou null
 */
async function finishFromExistingPart(modelsDir, model, info, status) {
  if (status.partialSize < info.minSize) return null;

  const partPath = `${status.path}.part`;
  await verifyIntegrity(partPath, info, model);
  fs.renameSync(partPath, status.path);
  writeMarker(status.path, info.sha256);
  return getModelStatus(modelsDir, model);
}

/** fetch real devolve web ReadableStream; aceita também Node Readable (testes). */
function toNodeStream(body) {
  return typeof body.pipe === 'function' ? body : Readable.fromWeb(body);
}

/**
 * Grava o corpo da resposta no `.part`, preservando o arquivo em caso de falha
 * para permitir retomada na próxima tentativa.
 */
async function pipelineOrCancel(nodeStream, fileStream, signal) {
  try {
    await pipeline(nodeStream, fileStream);
  } catch (err) {
    if (signal?.aborted) {
      const cancelled = new Error('Download do modelo cancelado.');
      cancelled.cancelled = true;
      throw cancelled;
    }
    throw err;
  }
}
