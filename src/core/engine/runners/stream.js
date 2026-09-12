/**
 * Runner: native fetch stream download with content validation.
 */

import fs from 'node:fs';
import path from 'node:path';

import { normalizeHeaders, DEFAULT_USER_AGENT } from '../../../utils.js';
import { progressUpdate, abortOutcome } from '../helpers.js';

/**
 * Detects if the first chunk of a response is not video content.
 * Returns { detected: true, code, error } or { detected: false }.
 */
function detectNonVideoContent(preview) {
  if (/^\s*#EXTM3U/i.test(preview)) {
    return { detected: true, code: 'HLS_MANIFEST', error: `Servidor retornou manifest HLS (m3u8) em vez de video. Conteudo: ${preview.slice(0, 200).replace(/\s+/g, ' ').trim()}` };
  }
  if (/^\s*<!DOCTYPE|^\s*<html/i.test(preview)) {
    return { detected: true, code: 'HTML_ERROR', error: `Servidor retornou HTML em vez de video. Conteudo: ${preview.slice(0, 200).replace(/\s+/g, ' ').trim()}` };
  }
  if (/^\s*\{[\s"]*(?:error|message|status)/i.test(preview)) {
    return { detected: true, code: 'JSON_ERROR', error: `Servidor retornou JSON de erro em vez de video. Conteudo: ${preview.slice(0, 200).replace(/\s+/g, ' ').trim()}` };
  }
  return { detected: false };
}

/**
 * Wraps a ReadableStream around a first chunk + original reader.
 */
function prependChunk(firstChunk, reader) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(firstChunk);
      function pump() {
        reader.read().then(({ done, value }) => {
          if (done) { controller.close(); return; }
          controller.enqueue(value);
          pump();
        }).catch((e) => controller.error(e));
      }
      pump();
    },
  });
}

/**
 * Streams a URL to a local file using native fetch.
 * Validates first bytes for HLS/HTML/JSON content masquerading as video.
 * Supports optional atomic writes (.part + rename).
 */
export async function runStreamDownload(url, output, headers, signal, onProgress, atomic) {
  const started = Date.now();
  let downloaded = 0;
  let total = 0;
  let atomicFile = null;

  if (atomic && typeof atomic.createAtomicFile === 'function') {
    atomicFile = atomic.createAtomicFile({ dir: path.dirname(output), filename: path.basename(output) });
    output = atomicFile.partPath;
  }

  try {
    const requestHeaders = normalizeHeaders({ 'User-Agent': DEFAULT_USER_AGENT, ...headers });
    const res = await fetch(url, { headers: requestHeaders, signal, redirect: 'follow' });
    if (!res.ok || !res.body) {
      return { ok: false, code: 'HTTP_ERROR', error: `HTTP ${res.status}`, status: res.status };
    }

    const reader = res.body.getReader();
    const { value: firstChunk } = await reader.read();
    if (!firstChunk || firstChunk.length === 0) {
      reader.cancel().catch(() => {});
      return { ok: false, code: 'EMPTY_RESPONSE', error: 'Resposta vazia do servidor.' };
    }

    const preview = new TextDecoder('utf-8', { fatal: false }).decode(firstChunk.slice(0, 1024));
    const detection = detectNonVideoContent(preview);
    if (detection.detected) {
      reader.cancel().catch(() => {});
      return { ok: false, code: detection.code, error: detection.error };
    }

    const bodyWithPrefix = prependChunk(firstChunk, reader);
    total = Number(res.headers.get('content-length') || 0);
    await fs.promises.mkdir(path.dirname(output), { recursive: true });

    const fh = await fs.promises.open(output, 'w');
    try {
      const bodyReader = bodyWithPrefix.getReader();
      for (;;) {
        const { done, value } = await bodyReader.read();
        if (done) break;
        if (value?.byteLength) {
          await fh.write(value, 0, value.byteLength);
          downloaded += value.byteLength;
          onProgress?.(progressUpdate(downloaded, total, started));
        }
      }
    } finally {
      await fh.close().catch(() => {});
    }

    if (signal?.aborted) {
      if (atomicFile) await atomicFile.abort().catch(() => {});
      return abortOutcome(signal);
    }
    if (atomicFile) {
      await atomicFile.commit().catch(() => {});
      if (!fs.existsSync(atomicFile.finalPath)) {
        return { ok: false, code: 'ATOMIC_COMMIT_FAILED', error: 'Falha ao finalizar arquivo.' };
      }
    }
    onProgress?.({ ...progressUpdate(downloaded, total, started), percent: 100 });
    return { ok: true };
  } catch (err) {
    if (atomicFile) await atomicFile.abort().catch(() => {});
    if (signal?.aborted) return abortOutcome(signal);
    return { ok: false, code: err?.code || 'DOWNLOAD_FAILED', error: err.message, status: err?.status };
  }
}
