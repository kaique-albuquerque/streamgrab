/**
 * Download de vídeo + N faixas de áudio com mux via FFmpeg (P12.1).
 */

import path from 'node:path';
import { createProgressReporter } from '../progress.js';
import { cleanupPartial, printStderrTail } from './diagnostics.js';
import { runDownloadFlow } from './single-mode.js';
import { buildMuxMultiArgs } from './mux-multi-args.js';
import { createTempDir, removeTempDir } from './temp.js';

/**
 * Downloads video + N audio tracks and muxes with FFmpeg.
 * Each audio track is downloaded separately, then all are muxed together.
 */
export async function runMuxMultiDownloadFlow(ctx, { videoUrl, audioUrls = [], audioLabels = [], audioLanguages = [], output, headers, totalBytes, durationMs }) {
  if (!audioUrls.length) {
    return { ok: false, error: 'no-audio-tracks' };
  }

  const tmpDir = createTempDir('vd-mux-multi-');
  const videoTmp = path.join(tmpDir, 'video.part.mp4');
  const audioTmps = audioUrls.map((_, i) => path.join(tmpDir, `audio_${i}.part.m4a`));
  const progress = createProgressReporter(ctx.io, { durationMs, label: 'Juntando video + audios' });

  try {
    // 1) Download video
    ctx.io.log('\nBaixando video...');
    let step = await runDownloadFlow(ctx, { url: videoUrl, output: videoTmp, headers, durationMs, label: 'Video' });
    if (!step.ok) return step;

    // 2) Download each audio track
    for (let i = 0; i < audioUrls.length; i++) {
      const label = audioLabels[i] || audioLanguages[i] || `audio ${i + 1}`;
      ctx.io.log(`\nBaixando audio ${i + 1}/${audioUrls.length} (${label})...`);
      step = await runDownloadFlow(ctx, { url: audioUrls[i], output: audioTmps[i], headers, durationMs, label });
      if (!step.ok) return step;
    }

    // 3) Mux with FFmpeg: -i video -i audio0 -i audio1 ... -map 0:v -map 1:a -map 2:a ...
    ctx.io.log('\nJuntando video + audios com FFmpeg...');
    const ffmpegArgs = buildMuxMultiArgs({ videoTmp, audioTmps, audioLanguages, audioLabels, output });

    const { ffmpegService } = await import('../../ffmpeg/service.js');
    const { promise, stop } = ffmpegService.run({
      args: ffmpegArgs,
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
    return { ok: false, error: 'mux-multi' };
  } finally {
    removeTempDir(tmpDir);
  }
}
