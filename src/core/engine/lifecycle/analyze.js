/**
 * Etapa de análise do DownloadEngine.
 */

import { transitionJob } from '../../models/index.js';
import { CancelledError } from '../../errors.js';
import { resolveFreshVariant, maskDiagUrl } from '../helpers.js';

export async function analyze(engine, job, { selectedUrl, headers, auth, forceYouTube }) {
  transitionJob(job, 'analyzing');
  engine._emit('start', { jobId: job.id, stage: 'analyzing', message: `Analisando ${maskDiagUrl(job.url)}` });
  if (job.meta?.recovered) {
    engine._emit('log', { jobId: job.id, message: '[recovery] Download recuperado apos crash — re-analisando com tokens frescos' });
  }
  const adapter = await engine.resolveAdapter(job.url, { headers, auth, forceYouTube });
  if (adapter.id === 'unknown') {
    const err = new Error('Fonte nao suportada.');
    err.code = 'UNSUPPORTED_SOURCE';
    throw err;
  }
  job._sourceType = adapter.id;
  job.meta.sourceType = adapter.id;
  let raw;
  try {
    raw = await engine.executor.analyze(adapter, { url: job.url, headers, auth });
  } catch (err) {
    if (engine._active.get(job.id)?.attempt?.signal.aborted) throw new CancelledError('Analise cancelada.');
    throw err;
  }
  job.title = raw?.title || job.title;
  job._analysis = raw;
  if (selectedUrl && raw?.kind === 'master' && Array.isArray(raw.variants) && raw.variants.length > 0) {
    const fresh = resolveFreshVariant(selectedUrl, raw.variants, raw.baseUrl);
    if (fresh) {
      engine._emit('log', { jobId: job.id, message: `[mdstrm] variante re-resolvida com tokens frescos: ${maskDiagUrl(fresh)} (era ${maskDiagUrl(selectedUrl)})` });
      selectedUrl = fresh;
    }
  }
  return { adapter, raw, selectedUrl };
}
