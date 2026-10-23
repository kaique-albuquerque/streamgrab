/**
 * Processamento de legendas após o download.
 */

import { embedSubtitles } from '../runners/index.js';

export async function processSubtitles(engine, job, prepared, { subtitleLanguages, embedSubs, headers }) {
  if (subtitleLanguages.length === 0 || !job.meta?.output) return;
  const subtitleTracks = prepared?._analysis?.subtitleTracks || job._analysis?.subtitleTracks || [];
  if (subtitleTracks.length === 0) return;
  engine._emit('log', { jobId: job.id, message: `[subs] processando ${subtitleTracks.length} legenda(s) disponivel(is)` });
  const subResult = await embedSubtitles({
    videoPath: job.meta.output, subtitleTracks,
    selectedLanguages: subtitleLanguages, embedSubs, headers,
    signal: engine._active.get(job.id)?.attempt?.signal,
    onLog: (message) => engine._emit('log', { jobId: job.id, message }),
  });
  if (!subResult?.ok) {
    engine._emit('log', { jobId: job.id, message: `[subs] aviso: ${subResult?.error || 'falha ao processar legendas'}` });
  }
}
