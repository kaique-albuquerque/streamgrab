/**
 * Download adaptativo (vídeo + áudio) com mux via FFmpeg.
 */

import path from 'node:path';
import { startMuxDownload } from '../../ffmpeg/muxer.js';
import { createProgressReporter } from '../progress.js';
import { cleanupPartial, printStderrTail } from './diagnostics.js';
import { runDownloadFlow } from './single-mode.js';
import { createTempDir, removeTempDir } from './temp.js';

export async function runMuxedDownloadFlow(ctx, { videoUrl, audioUrl, output, headers, videoBytes, audioBytes, totalBytes, durationMs }) {
  const tmpDir = createTempDir('vd-yt-');
  const videoTmp = path.join(tmpDir, 'video.part.mp4');
  const audioTmp = path.join(tmpDir, 'audio.part.m4a');
  const progress = createProgressReporter(ctx.io, { durationMs, label: 'Juntando video e audio' });

  try {
    ctx.io.log('\nBaixando video adaptativo do YouTube...');
    let step = await runDownloadFlow(ctx, { url: videoUrl, output: videoTmp, headers, totalBytes: videoBytes, durationMs, label: 'Video' });
    if (!step.ok) return step;

    ctx.io.log('\nBaixando audio adaptativo do YouTube...');
    step = await runDownloadFlow(ctx, { url: audioUrl, output: audioTmp, headers, totalBytes: audioBytes, durationMs, label: 'Audio' });
    if (!step.ok) return step;

    ctx.io.log('\nJuntando video e audio com FFmpeg...');
    const { promise, stop } = startMuxDownload({
      videoInput: videoTmp,
      audioInput: audioTmp,
      output,
      onProgress: progress.update,
    });
    ctx.currentFfmpeg = { stop };
    const result = await promise;
    ctx.currentFfmpeg = null;
    progress.finish(result.ok);
    if (result.ok) return { ok: true, modeIndex: 0 };
    if (result.interrupted || ctx.interruptHandled) {
      cleanupPartial(output);
      return { ok: false, interrupted: true };
    }
    cleanupPartial(output);
    printStderrTail(ctx.io, result, '');
    return { ok: false, error: 'mux' };
  } finally {
    removeTempDir(tmpDir);
  }
}
