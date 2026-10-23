/**
 * Etapa de preparação (prepare) do DownloadEngine.
 */

import { transitionJob } from '../../models/index.js';
import { CancelledError } from '../../errors.js';
import { estimateMuxSpace } from '../../disk.js';
import { getDefaultDownloadsDir } from '../../../utils.js';
import { normalizePreparedDownload } from '../helpers.js';

export async function prepare(engine, job, adapter, raw, {
  selectedUrl, destination, headers, auth,
  audioLanguage, allAudio, subtitleLanguages = [], embedSubs = false,
}) {
  transitionJob(job, 'preparing');
  engine._emit('progress', { jobId: job.id, stage: 'preparing', message: 'Preparando download' });
  const preparedRaw = await engine.executor.prepare(adapter, {
    url: job.url, analysis: raw, selectedUrl, headers, auth,
    audioLanguage, allAudio, subtitleLanguages, embedSubs,
  });
  const prepared = normalizePreparedDownload(preparedRaw);
  if (engine._isAborted(job)) throw new CancelledError('Download cancelado.');
  job._prepared = prepared;
  job._downloadPlan = prepared?._downloadPlan || null;
  job.meta.totalBytes = Number(prepared.totalBytes || 0);
  job.meta.durationMs = Number(prepared.durationMs || 0);
  const dir = destination || engine.settings?.get?.('defaultDir') || getDefaultDownloadsDir();
  if (engine.disk && job.meta.totalBytes > 0) {
    const extra = prepared.strategy === 'mux'
      ? Math.max(0, estimateMuxSpace(job.meta.totalBytes) - job.meta.totalBytes) : 0;
    await engine.disk.check({ dir, requiredBytes: job.meta.totalBytes, extraBytes: extra });
  }
  return { prepared };
}
