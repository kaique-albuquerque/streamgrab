/**
 * Resolução do caminho de saída do download.
 *
 * O nome é reservado no engine enquanto o job está vivo: vários jobs que
 * começam juntos (lote) veriam o mesmo nome livre no disco e escreveriam no
 * mesmo arquivo — o sintoma era "só um arquivo baixado".
 */

import fs from 'node:fs';

import { getDefaultDownloadsDir } from '../../../utils.js';
import { resolveSafeFilename, nextAvailableName } from '../../filenames.js';
import { FALLBACK_TITLE } from '../helpers.js';
import { extensionFor, stripForeignExtension } from './extension.js';

export function resolveOutput(engine, job, prepared, destination) {
  const dir = destination || engine.settings?.get?.('defaultDir') || getDefaultDownloadsDir();
  const ext = extensionFor(prepared, job._sourceType || job.meta?.sourceType);
  const base = stripForeignExtension(job.meta?.filename || job.title || FALLBACK_TITLE, ext);
  const reserved = engine?._reservedOutputs instanceof Set ? engine._reservedOutputs : null;
  const exists = (p) => fs.existsSync(p) || Boolean(reserved && reserved.has(p));
  const output = nextAvailableName(resolveSafeFilename(base, { dir, ext }), exists);
  if (reserved) reserved.add(output);
  return output;
}
