/**
 * Download HTTP em partes paralelas com retomada.
 */

import fs from 'node:fs';

import { StreamGrabError } from '../../core/errors.js';
import { createProgressReporter } from '../progress.js';
import { computeRanges } from '../file-download-shared.js';
import { mergePartFiles } from './merge.js';
import { savePartManifest } from './manifest.js';
import { cleanupPartArtifacts, createPartManifestPath, createPartsDir } from './paths.js';
import { collectPendingParts, prepareManifest, reconcileParts } from './resume.js';
import { runPartWorkers } from './worker-pool.js';

async function verifyMergedOutput(output, totalBytes) {
  const mergedStat = await fs.promises.stat(output).catch(() => null);
  if (!mergedStat || mergedStat.size !== totalBytes) {
    throw new StreamGrabError(`Merge final invalido (esperado ${totalBytes}, recebeu ${mergedStat?.size || 0}).`, {
      code: 'INVALID_MERGE_SIZE',
    });
  }
}

export async function downloadPartFiles({ url, output, headers, totalBytes, etag, lastModified, concurrency, blockCount, io }) {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
    throw new StreamGrabError('Tamanho total desconhecido para download em partes.', { code: 'RANGE_SIZE_UNKNOWN' });
  }

  const partsDir = createPartsDir(output);
  const manifestPath = createPartManifestPath(output);
  await fs.promises.mkdir(partsDir, { recursive: true });

  const ranges = computeRanges(totalBytes, blockCount);
  const manifest = await prepareManifest({
    url,
    output,
    totalBytes,
    etag,
    lastModified,
    ranges,
    manifestPath,
    partsDir,
    io,
  });

  const progress = createProgressReporter(io, { totalBytes, label: 'Arquivo' });
  let downloaded = await reconcileParts({ partsDir, ranges, manifest });
  await savePartManifest(manifestPath, manifest);
  progress.update({ key: 'total_size', value: downloaded });

  const pending = collectPendingParts({ partsDir, ranges, manifest });

  const { failed, failedRange } = await runPartWorkers({
    pending,
    concurrency,
    partsDir,
    url,
    headers,
    io,
    manifestPath,
    manifest,
    onBytes(bytes) {
      downloaded += bytes;
      progress.update({ key: 'total_size', value: downloaded });
    },
  });
  progress.finish(!failed);

  if (failed) {
    const detail = failedRange ? `parte ${failedRange.index + 1} (${failedRange.start}-${failedRange.end})` : 'parte desconhecida';
    throw new StreamGrabError(`Falha em ${detail}: ${failed.message}`, {
      code: failed.code || 'PART_DOWNLOAD_FAILED',
      cause: failed,
    });
  }

  await mergePartFiles(partsDir, ranges, output);
  await verifyMergedOutput(output, totalBytes);
  await cleanupPartArtifacts(output);

  return { ok: true, output, partCount: ranges.length };
}
