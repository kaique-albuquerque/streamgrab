import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mux } from '../../ffmpeg/muxer.js';
import { createProgressReporter } from '../progress.js';
import { cleanupPartial } from '../download.js';
import { runTurboDownloadFlow } from './single.js';

/**
 * Fluxo turbo para formatos adaptativos (video + audio separados): baixa os
 * dois em paralelo e junta com FFmpeg (-c copy), igual ao runMuxedDownloadFlow.
 */
export async function runTurboMuxedDownloadFlow(ctx, {
  videoUrl,
  audioUrl,
  output,
  headers,
  durationMs,
}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-turbo-'));
  const videoTmp = path.join(tmpDir, 'video.part.mp4');
  const audioTmp = path.join(tmpDir, 'audio.part.m4a');

  try {
    ctx.io.log('\nBaixando video e audio em paralelo (turbo)...');
    const abort = new AbortController();
    ctx.turboAbort = abort;
    const [video, audio] = await Promise.all([
      // tmpDir e efemero (removido no finally) — resume de streams nao se aplica.
      runTurboDownloadFlow(ctx, { url: videoUrl, output: videoTmp, headers, durationMs, label: 'Video', signal: abort, resume: false }),
      runTurboDownloadFlow(ctx, { url: audioUrl, output: audioTmp, headers, durationMs, label: 'Audio', signal: abort, resume: false }),
    ]);
    ctx.turboAbort = null;
    if (!video.ok) return video;
    if (!audio.ok) return audio;
    if (abort.signal.aborted) {
      cleanupPartial(output);
      return { ok: false, interrupted: true };
    }

    ctx.io.log('\nJuntando video e audio com FFmpeg...');
    const progress = createProgressReporter(ctx.io, { durationMs, label: 'Juntando video e audio' });
    const { promise, stop } = mux({
      videoInput: videoTmp,
      audioInput: audioTmp,
      output,
      onProgress: progress.update,
    });
    ctx.currentFfmpeg = { stop };
    const result = await promise;
    ctx.currentFfmpeg = null;
    progress.finish();
    if (result.ok) return { ok: true };
    if (result.interrupted || ctx.interruptHandled) {
      cleanupPartial(output);
      return { ok: false, interrupted: true };
    }
    cleanupPartial(output);
    return { ok: false, error: 'mux' };
  } finally {
    ctx.turboAbort = null;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignora */
    }
  }
}
