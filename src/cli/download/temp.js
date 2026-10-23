/**
 * Diretório temporário para as etapas de mux.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function removeTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignora */
  }
}
