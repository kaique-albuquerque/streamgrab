/**
 * Runner: DASH segmented download backend.
 */

import fs from 'node:fs';

import { startDownload, startMuxDownload } from '../../../ffmpeg.js';
import { prepareDashSegmentDownloadToLocal } from '../../../transports/backends/dash-segments/index.js';
import { abortOutcome, segmentProgressToEngine, makeFfmpegProgress } from '../helpers.js';

/**
 * Downloads DASH via segment backend, then muxes or copies.
 */
export async function runDashSegmentedDownload(
  url, output, headers, signal, onProgress,
  {
    prepareDashSegments = prepareDashSegmentDownloadToLocal,
    ffmpegStartDownload = startDownload,
    ffmpegStartMuxDownload = startMuxDownload,
    checkpoint = null, tmpDir = null, onCheckpoint, adaptive = null,
  } = {}
) {
  const prepared = await prepareDashSegments({
    url, headers, signal, tmpDir: tmpDir || undefined,
    checkpoint, adaptive, onCheckpoint,
    onProgress: (p) => onProgress?.(segmentProgressToEngine(p, Date.now())),
  });
  if (!prepared?.ok) {
    if (prepared.code === 'MANIFEST_UNSUPPORTED') return null;
    if (prepared.code === 'CANCELLED') return abortOutcome(signal);
    return {
      ok: false, code: prepared.code || 'DASH_SEGMENTS_FAILED',
      error: prepared.error || 'Falha no backend segmentado DASH.',
      status: prepared.status || 0,
    };
  }

  try {
    if (prepared.mode === 'mux' && prepared.videoPath && prepared.audioPath) {
      onProgress?.({ stage: 'merging', percent: 90, message: 'Juntando trilhas DASH com FFmpeg' });
      const { promise, stop } = ffmpegStartMuxDownload({
        videoInput: prepared.videoPath,
        audioInput: prepared.audioPath,
        output,
        onProgress: makeFfmpegProgress((u) => onProgress?.({ ...u, stage: 'merging' }), 0),
      });
      const onAbort = () => stop();
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const result = await promise;
        if (signal?.aborted) return abortOutcome(signal);
        if (result.ok) return { ok: true };
        const detail = result.stderr ? ` stderr=${result.stderr.slice(0, 500)}` : '';
        return {
          ok: false, code: 'MUX_FAILED',
          error: `ffmpeg mux saiu com codigo ${result.code ?? 'desconhecido'}${detail}`,
        };
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
    }

    if (prepared.mode === 'single' && prepared.videoPath) {
      await fs.promises.copyFile(prepared.videoPath, output);
      return { ok: true };
    }

    return null;
  } finally {
    prepared.cleanup?.();
  }
}
