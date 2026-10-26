/** Execucao de jobs do DownloadEngine (run + pipeline do ciclo de vida). */

import { createDownloadJob, serializeJob, isTerminalJobState } from '../../models/index.js';
import {
  analyze as _analyze,
  prepare as _prepare,
  resolveOutput as _resolveOutput,
  downloadLoop as _downloadLoop,
  processSubtitles,
  processTranscription,
} from '../lifecycle.js';
import { complete as _complete, handleFailure as _handleFailure } from '../completion.js';
import { nextJobId } from './registry.js';

/** Executa um job existente (por id) ou cria um novo a partir da URL. */
export async function runTarget(engine, target, opts = {}) {
  let job;
  const existing = typeof target === 'string' ? engine._jobs.get(target) : null;
  if (existing) {
    if (isTerminalJobState(existing.state)) {
      const err = new Error(`Job ${existing.id} ja finalizado (${existing.state}).`);
      err.code = 'JOB_ALREADY_FINAL';
      throw err;
    }
    if (existing.state !== 'queued') {
      const err = new Error(`Job ${existing.id} ja esta em andamento (${existing.state}).`);
      err.code = 'JOB_ALREADY_RUNNING';
      throw err;
    }
    job = existing;
  } else {
    job = createDownloadJob({ id: nextJobId(), url: target, title: opts.title, meta: opts.meta });
    engine._jobs.set(job.id, job);
  }
  await runJob(engine, job, opts);
  return serializeJob(job);
}

/** Conduz o pipeline completo de um job ate o estado terminal. */
export async function runJob(engine, job, {
  selectedUrl, destination, headers = {}, auth = {},
  forceYouTube = false, mode, audioLanguage, allAudio,
  subtitleLanguages = [], embedSubs = false, turbo, turboChunks,
  transcribe = false, transcribeLang, transcribeTimestamps,
} = {}) {
  try {
    const analyzed = await _analyze(engine, job, { selectedUrl, headers, auth, forceYouTube });
    const { adapter, raw } = analyzed;
    const { prepared } = await _prepare(engine, job, adapter, raw, {
      selectedUrl: analyzed.selectedUrl, destination, headers, auth,
      audioLanguage, allAudio, subtitleLanguages, embedSubs,
    });
    const outputPath = _resolveOutput(engine, job, prepared, destination);
    job.meta.output = outputPath;
    await _downloadLoop(engine, job, adapter, prepared, { headers, mode, turbo, turboChunks });
    await processSubtitles(engine, job, prepared, { subtitleLanguages, embedSubs, headers });
    await processTranscription(engine, job, {
      transcribe, transcribeLang, transcribeTimestamps,
    });
    _complete(engine, job);
  } catch (err) {
    _handleFailure(engine, job, err);
  } finally {
    engine._active.delete(job.id);
  }
}
