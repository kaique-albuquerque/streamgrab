/**
 * Runner: HLS segmented download backend.
 */

import { startDownload } from '../../../ffmpeg.js';
import { prepareHlsSegmentDownloadToLocal } from '../../../transports/backends/hls-segments/index.js';
import { progressUpdate, abortOutcome, segmentProgressToEngine, makeFfmpegProgress } from '../helpers.js';

/**
 * Downloads HLS via segment backend, then muxes with FFmpeg.
 */
export async function runHlsSegmentedDownload(
  url, output, headers, signal, onProgress,
  { preferredVariantPath = '' } = {},
  {
    prepareHlsSegments = prepareHlsSegmentDownloadToLocal,
    ffmpegStartDownload = startDownload,
    checkpoint = null, tmpDir = null, onCheckpoint, adaptive = null,
  } = {}
) {
  const segmentStartedAtMs = Date.now();
  const prepared = await prepareHlsSegments({
    url, headers, signal, tmpDir: tmpDir || undefined,
    checkpoint, preferredVariantPath, adaptive, onCheckpoint,
    onProgress: (p) => onProgress?.(segmentProgressToEngine(p, segmentStartedAtMs)),
  });
  if (!prepared?.ok) {
    if (prepared.code === 'MANIFEST_UNSUPPORTED') return null;
    if (prepared.code === 'CANCELLED') return abortOutcome(signal);
    return {
      ok: false, code: prepared.code || 'HLS_SEGMENTS_FAILED',
      error: prepared.error || 'Falha no backend segmentado HLS.',
      status: prepared.status || 0,
    };
  }

  onProgress?.({ stage: 'merging', percent: 90, message: 'Juntando segmentos HLS com FFmpeg' });
  const { promise, stop } = ffmpegStartDownload({
    url: prepared.localPlaylist, output, headers: {},
    modeIndex: 0, extraArgs: prepared.extraArgs,
    onProgress: makeFfmpegProgress((u) => onProgress?.({ ...u, stage: 'merging' }), 0),
  });
  const onAbort = () => stop();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const result = await promise;
    if (signal?.aborted) return abortOutcome(signal);
    if (result.ok) {
      onProgress?.({ ...progressUpdate(0, 0, Date.now()), percent: 100, stage: 'merging' });
      return { ok: true };
    }
    return {
      ok: false, code: 'FFMPEG_FAILED',
      error: `ffmpeg saiu com codigo ${result.code ?? 'desconhecido'}`,
      detail: String(result.stderr || '').slice(-2000),
    };
  } finally {
    signal?.removeEventListener('abort', onAbort);
    prepared.cleanup?.();
  }
}
