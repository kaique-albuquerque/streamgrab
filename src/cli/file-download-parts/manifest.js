/**
 * Manifesto de retomada: criação, leitura, escrita e validação.
 */

import fs from 'node:fs';
import { PART_MANIFEST_VERSION } from '../file-download-shared.js';

export function createPartManifest({ url, output, totalBytes, etag = '', lastModified = '', ranges = [] }) {
  const now = new Date().toISOString();
  return {
    version: PART_MANIFEST_VERSION,
    url,
    output,
    totalBytes,
    etag: etag || '',
    lastModified: lastModified || '',
    createdAt: now,
    updatedAt: now,
    parts: ranges.map((range) => ({
      index: range.index,
      start: range.start,
      end: range.end,
      completed: false,
      size: 0,
    })),
  };
}

export function loadPartManifest(manifestPath) {
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== PART_MANIFEST_VERSION || !Array.isArray(parsed.parts)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function savePartManifest(manifestPath, manifest) {
  if (!manifestPath || !manifest) return false;
  manifest.updatedAt = new Date().toISOString();
  const tmpPath = `${manifestPath}.tmp`;
  try {
    await fs.promises.writeFile(tmpPath, JSON.stringify(manifest, null, 2), 'utf8');
    await fs.promises.rename(tmpPath, manifestPath);
    return true;
  } catch {
    return false;
  }
}

export function validatePartManifest(manifest, { url, totalBytes, etag = '', lastModified = '', blockCount }) {
  if (!manifest) return { ok: false, reason: 'manifest ausente' };
  if (manifest.url !== url) return { ok: false, reason: 'URL final mudou' };
  if (Number(manifest.totalBytes || 0) !== Number(totalBytes || 0)) return { ok: false, reason: 'tamanho total mudou' };
  if (Number(manifest.parts?.length || 0) !== Number(blockCount || 0)) return { ok: false, reason: 'quantidade de partes mudou' };
  if (manifest.etag && etag && manifest.etag !== etag) return { ok: false, reason: 'ETag mudou' };
  if (manifest.etag && !etag) return { ok: false, reason: 'ETag antigo existe mas o servidor nao enviou validator agora' };
  if (manifest.lastModified && lastModified && manifest.lastModified !== lastModified) {
    return { ok: false, reason: 'Last-Modified mudou' };
  }
  if (manifest.lastModified && !lastModified) {
    return { ok: false, reason: 'Last-Modified antigo existe mas o servidor nao enviou validator agora' };
  }
  return { ok: true };
}

export async function persistPartCompletion(manifestPath, manifest, range) {
  const part = manifest.parts.find((item) => item.index === range.index);
  if (!part) return false;
  part.completed = true;
  part.size = range.end - range.start + 1;
  return savePartManifest(manifestPath, manifest);
}
