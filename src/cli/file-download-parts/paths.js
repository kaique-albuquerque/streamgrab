/**
 * Caminhos e limpeza dos artefatos do download por partes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { PART_FILE_SUFFIX } from '../file-download-shared.js';

/** Diretório com os arquivos temporários de um download. */
export function createPartsDir(output) {
  return `${output}.parts`;
}

/** Caminho de uma parte (índice com 4 dígitos, ordem de escrita). */
export function createPartPath(partsDir, index) {
  return path.join(partsDir, `${String(index).padStart(4, '0')}${PART_FILE_SUFFIX}`);
}

/** Manifesto de retomada do download. */
export function createPartManifestPath(output) {
  return `${output}.parts.json`;
}

export async function cleanupPartsDir(partsDir) {
  await fs.promises.rm(partsDir, { recursive: true, force: true }).catch(() => {});
}

/** Remove diretório de partes e manifesto (inclusive o `.tmp` de escrita). */
export async function cleanupPartArtifacts(output) {
  await cleanupPartsDir(createPartsDir(output));
  await fs.promises.unlink(createPartManifestPath(output)).catch(() => {});
  await fs.promises.unlink(`${createPartManifestPath(output)}.tmp`).catch(() => {});
}
