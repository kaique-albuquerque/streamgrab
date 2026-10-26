/**
 * Download de chaves, maps e segmentos de uma playlist media, gerando a
 * playlist local que aponta para os arquivos baixados.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseSegmentPlaylist } from '../../../hls.js';
import { extForUri, rewritePlaylist } from '../playlist.js';

const SEGMENT_WORKERS = 6;
const SEGMENT_ATTEMPTS = 3;

/**
 * @param {import('./index.js').CurlImpersonateTransport} transport
 * @param {object} params
 * @param {string} params.mediaText — texto da playlist media.
 * @param {string} params.mediaBase — URL base para resolver URIs relativas.
 * @param {string} params.tmpDir — diretorio temporario (o chamador limpa).
 * @param {AbortSignal} [params.signal]
 * @param {Function} [params.shouldStop] — `() => boolean` (Ctrl+C da CLI).
 * @param {Function} [params.onProgress] — `({done, total, totalBytes, failed})`.
 */
export async function downloadSegments(transport, {
  mediaText, mediaBase, tmpDir, signal, shouldStop, onProgress,
} = {}) {
  const parsed = parseSegmentPlaylist(mediaText);
  if (!parsed.segments.length) return { ok: false, error: 'sem segmentos' };

  const stopped = () => (shouldStop?.() || signal?.aborted || false);

  const keyFiles = new Map();
  for (const k of parsed.keys) {
    const keyUrl = new URL(k.uri, mediaBase).toString();
    const local = path.join(tmpDir, `key_${keyFiles.size}.bin`);
    const r = await transport.fetch(keyUrl, local, { signal });
    if (!r.ok) return { ok: false, error: 'chave' };
    keyFiles.set(keyUrl, local);
  }

  const fallbackExt = parsed.maps.length > 0 ? 'mp4' : 'ts';

  const mapFiles = new Map();
  for (const m of parsed.maps) {
    const mapUrl = new URL(m.uri, mediaBase).toString();
    const local = path.join(tmpDir, `init_${mapFiles.size}.${extForUri(m.uri, 'mp4')}`);
    const r = await transport.fetch(mapUrl, local, { signal });
    if (!r.ok) return { ok: false, error: 'init' };
    mapFiles.set(mapUrl, local);
  }

  const segMap = new Map();
  const queue = parsed.segments.map((s) => ({ url: new URL(s.uri, mediaBase).toString(), uri: s.uri }));
  const total = queue.length;
  let nextIdx = 0;
  let done = 0;
  let failed = 0;
  let totalBytes = 0;

  const worker = async () => {
    while (queue.length) {
      if (stopped()) return;
      const seg = queue.shift();
      const local = path.join(tmpDir, `seg_${String(nextIdx++).padStart(5, '0')}.${extForUri(seg.uri, fallbackExt)}`);
      let r = null;
      for (let attempt = 1; attempt <= SEGMENT_ATTEMPTS && !stopped(); attempt++) {
        r = await transport.fetch(seg.url, local, { signal });
        if (r.ok) break;
      }
      if (stopped()) return;
      if (r && r.ok) {
        segMap.set(seg.url, local);
        try { totalBytes += fs.statSync(local).size; } catch { /* ignora */ }
      } else {
        failed++;
      }
      done++;
      onProgress?.({ done, total, totalBytes, failed });
    }
  };

  await Promise.all(Array.from({ length: Math.min(SEGMENT_WORKERS, total) }, worker));

  if (stopped()) return { ok: false, error: 'interrupted' };
  if (failed > 0) return { ok: false, error: 'segmentos' };

  const localPlaylist = path.join(tmpDir, 'local.m3u8');
  fs.writeFileSync(localPlaylist, rewritePlaylist(mediaText, segMap, keyFiles, mapFiles, mediaBase), 'utf8');
  const extraArgs = parsed.keys.length > 0 ? ['-allowed_extensions', 'ALL'] : [];
  return { ok: true, localPlaylist, extraArgs, keyCount: parsed.keys.length, totalBytes };
}
