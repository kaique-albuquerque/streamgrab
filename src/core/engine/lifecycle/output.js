/**
 * Resolução do caminho de saída do download.
 */

import { getDefaultDownloadsDir } from '../../../utils.js';
import { resolveSafeFilename, nextAvailableName } from '../../filenames.js';
import { FALLBACK_TITLE } from '../helpers.js';
import { extensionFor } from './extension.js';

export function resolveOutput(engine, job, prepared, destination) {
  const dir = destination || engine.settings?.get?.('defaultDir') || getDefaultDownloadsDir();
  const base = job.meta?.filename || job.title || FALLBACK_TITLE;
  const ext = extensionFor(prepared, job._sourceType || job.meta?.sourceType);
  return nextAvailableName(resolveSafeFilename(base, { dir, ext }));
}
