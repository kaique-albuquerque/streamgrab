import fs from 'node:fs';
import path from 'node:path';

import { getDefaultDownloadsDir } from '../../utils.js';
import { resolveExistingFileForGeneric } from '../file-download-prompt.js';
import { sanitizePreservingExtension } from '../file-download-shared.js';

/**
 * Resolve pasta/nome de saída, criando o diretório e tratando conflitos.
 *
 * @returns {Promise<{ ok: boolean, resolvedName?: string, output?: string,
 *                     cancelled?: boolean, code?: number, error?: Error }>}
 */
export async function resolveOutputPath({ flags, remote, ask, io }) {
  const dir = flags.outputDir ? path.resolve(flags.outputDir) : getDefaultDownloadsDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    io.error(`\n[ERRO] Nao foi possivel usar a pasta "${dir}": ${err.message}`);
    return { ok: false, code: 1, error: err };
  }

  const resolvedName = sanitizePreservingExtension(flags.filename || remote.filename || 'arquivo.bin');
  let output = path.join(dir, resolvedName);

  if (ask) {
    const resolved = await resolveExistingFileForGeneric(ask, io, output);
    if (resolved.action === 'cancel') {
      io.log('\nCancelado.');
      return { ok: false, cancelled: true, code: 0, resolvedName, output };
    }
    output = resolved.output;
  }

  return { ok: true, resolvedName, output };
}
