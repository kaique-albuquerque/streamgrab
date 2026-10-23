/**
 * Limpeza e cache dos arquivos de preview.
 */

import fs from 'node:fs';
import path from 'node:path';
import { PREVIEW_CACHE_MS } from './constants.js';
import { getPreviewDir } from './eligibility.js';

/** Remove um arquivo de preview (silencioso se já não existir). */
export function clearPreview(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Remove previews mais antigos que PREVIEW_CACHE_MS. Retorna quantos removeu. */
export function cleanOldPreviews(tempDir, { now = Date.now(), maxAgeMs = PREVIEW_CACHE_MS } = {}) {
  const previewDir = getPreviewDir(tempDir);
  let removed = 0;
  let files;
  try {
    files = fs.readdirSync(previewDir);
  } catch {
    return 0;
  }
  for (const file of files) {
    const filePath = path.join(previewDir, file);
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        removed++;
      }
    } catch {
      /* arquivo pode ter sido removido em paralelo */
    }
  }
  return removed;
}
