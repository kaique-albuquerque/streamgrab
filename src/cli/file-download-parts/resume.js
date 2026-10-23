/**
 * Retomada: validação do manifesto e reconciliação com as partes em disco.
 */

import fs from 'node:fs';
import { createPartManifest, loadPartManifest, savePartManifest, validatePartManifest } from './manifest.js';
import { cleanupPartArtifacts, createPartPath } from './paths.js';

/**
 * Carrega o manifesto anterior ou cria um novo quando ele não se aplica
 * (URL, tamanho, quantidade de partes ou validators mudaram).
 *
 * @returns {Promise<object>} Manifesto válido para esta execução
 */
export async function prepareManifest({ url, output, totalBytes, etag, lastModified, ranges, manifestPath, partsDir, io }) {
  let manifest = loadPartManifest(manifestPath);
  const status = validatePartManifest(manifest, { url, totalBytes, etag, lastModified, blockCount: ranges.length });

  if (!status.ok) {
    if (manifest) {
      io.log(`[resume] Manifest antigo descartado: ${status.reason}.`);
      await cleanupPartArtifacts(output);
      await fs.promises.mkdir(partsDir, { recursive: true });
    }
    manifest = createPartManifest({ url, output, totalBytes, etag, lastModified, ranges });
    await savePartManifest(manifestPath, manifest);
  } else {
    io.log('[resume] Reutilizando partes existentes validadas pelo manifest.');
  }

  return manifest;
}

/**
 * Confere as partes já gravadas e marca no manifesto as que não servem.
 *
 * @returns {Promise<number>} Bytes já baixados e válidos
 */
export async function reconcileParts({ partsDir, ranges, manifest }) {
  let downloaded = 0;

  for (const range of ranges) {
    const partPath = createPartPath(partsDir, range.index);
    const expected = range.end - range.start + 1;
    const manifestPart = manifest.parts.find((item) => item.index === range.index);
    try {
      const stat = await fs.promises.stat(partPath);
      if (stat.size === expected && manifestPart?.completed) {
        downloaded += expected;
      } else {
        await fs.promises.unlink(partPath).catch(() => {});
        if (manifestPart) {
          manifestPart.completed = false;
          manifestPart.size = 0;
        }
      }
    } catch {
      if (manifestPart) {
        manifestPart.completed = false;
        manifestPart.size = 0;
      }
    }
  }

  return downloaded;
}

/** Ranges que ainda precisam ser baixados, na ordem de escrita. */
export function collectPendingParts({ partsDir, ranges, manifest }) {
  return ranges.filter((range) => {
    const manifestPart = manifest.parts.find((item) => item.index === range.index);
    if (!manifestPart?.completed) return true;
    const partPath = createPartPath(partsDir, range.index);
    try {
      const stat = fs.statSync(partPath);
      return stat.size !== range.end - range.start + 1;
    } catch {
      return true;
    }
  });
}
