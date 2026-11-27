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

  // init + media segment: o init (ftyp/moov) precisa ser concatenado ao
  // media (moof/mdat) antes de qualquer mux/remux — so o init gera um MP4
  // "corrompido" sem frames.
  const joinedInputs = [];
  const joinInitMedia = (initPath, mediaPath, tag) => {
    if (!initPath || !mediaPath || initPath === mediaPath) return mediaPath;
    const joined = `${output}.${tag}.mp4`;
    fs.writeFileSync(joined, Buffer.concat([fs.readFileSync(initPath), fs.readFileSync(mediaPath)]));
    joinedInputs.push(joined);
    return joined;
  };

  try {
    const videoInput = joinInitMedia(prepared.initPath, prepared.videoPath, 'video');

    if (prepared.mode === 'mux' && videoInput && prepared.audioPath) {
      const audioInput = joinInitMedia(prepared.audioInitPath, prepared.audioPath, 'audio');
      onProgress?.({ stage: 'merging', percent: 90, message: 'Juntando trilhas DASH com FFmpeg' });
      const { promise, stop } = ffmpegStartMuxDownload({
        videoInput,
        audioInput,
        output,
        onProgress: makeFfmpegProgress((u) => onProgress?.({ ...u, stage: 'merging' }), 0, { minPercent: 90 }),
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

    if (prepared.mode === 'single' && videoInput) {
      // Sem init para juntar: basta reempacotar o media em MP4 progressivo.
      if (videoInput === prepared.videoPath && prepared.initPath) {
        await fs.promises.copyFile(prepared.videoPath, output);
        return { ok: true };
      }
      onProgress?.({ stage: 'merging', percent: 90, message: 'Juntando init + media DASH com FFmpeg' });
      const { promise, stop } = ffmpegStartDownload({
        url: videoInput,
        output,
        onProgress: makeFfmpegProgress((u) => onProgress?.({ ...u, stage: 'merging' }), 0, { minPercent: 90 }),
      });
      const onAbort = () => stop();
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const result = await promise;
        if (signal?.aborted) return abortOutcome(signal);
        if (result.ok) return { ok: true };
        const detail = result.stderr ? ` stderr=${result.stderr.slice(0, 500)}` : '';
        return {
          ok: false, code: 'REMUX_FAILED',
          error: `ffmpeg remux saiu com codigo ${result.code ?? 'desconhecido'}${detail}`,
        };
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
    }

    return null;
  } finally {
    for (const f of joinedInputs) {
      try { fs.rmSync(f, { force: true }); } catch { /* ignora */ }
    }
    prepared.cleanup?.();
  }
}
