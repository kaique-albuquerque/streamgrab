/**
 * Runner: direct FFmpeg download (HLS/DASH via URL).
 */

import { startDownload } from '../../../ffmpeg.js';
import { abortOutcome, makeFfmpegProgress } from '../helpers.js';

/**
 * Downloads a URL directly using FFmpeg (for HLS/DASH manifests).
 */
export async function runFfmpegDownload(
  url, output, headers, signal, onProgress,
  sourceType, modeIndex = 0, durationMs = 0, ffmpegDownload = startDownload
) {
  const extraArgs = sourceType === 'hls' ? ['-allowed_extensions', 'ALL'] : [];
  const { promise, stop } = ffmpegDownload({
    url, output, headers, modeIndex, extraArgs,
    onProgress: makeFfmpegProgress(onProgress, durationMs),
  });
  const onAbort = () => stop();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const result = await promise;
    if (signal?.aborted) return abortOutcome(signal);
    if (result.ok) return { ok: true };
    if (result.interrupted) return { paused: true };
    return {
      ok: false,
      code: 'FFMPEG_FAILED',
      error: `ffmpeg saiu com codigo ${result.code ?? 'desconhecido'}`,
      detail: String(result.stderr || '').slice(-2000),
    };
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
