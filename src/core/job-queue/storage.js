/**
 * Persistência (JSON em arquivo) do núcleo de fila.
 *
 * O `snapshot` de domínio é injetável (`ctx.snapshotJob`); este módulo só
 * conhece o formato genérico de um job persistido.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Storage JSON em arquivo (atomic write: temp + rename).
 *
 * @param {{ file: string }} params
 */
export function createJsonJobStorage({ file }) {
  return {
    load() {
      try {
        if (!fs.existsSync(file)) return [];
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        return Array.isArray(raw) ? raw : [];
      } catch {
        return [];
      }
    },
    save(jobs) {
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(jobs, null, 2), 'utf8');
        fs.renameSync(tmp, file);
      } catch {
        /* persistência nunca derruba o fluxo */
      }
    },
  };
}