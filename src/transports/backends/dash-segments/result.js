/**
 * DASH segments — montagem do estado compartilhado e do resultado final.
 *
 * Separa a preparacao (fila, checkpoint, controller) da construcao do
 * payload devolvido ao runner, para manter cada arquivo abaixo do limite.
 */

import fs from 'node:fs';

import { isInitSegment } from './helpers.js';
import { createAdaptiveController } from '../../adaptive-controller.js';

/** Monta a fila de representacoes (video primeiro, audio opcional). */
export function buildQueue(videoRep, audioRep, videoCheckpointId, audioCheckpointId) {
  return [
    { rep: videoRep, kind: 'video', checkpointId: videoCheckpointId },
    ...(audioRep ? [{ rep: audioRep, kind: 'audio', checkpointId: audioCheckpointId }] : []),
  ];
}

/** Converte o checkpoint persistido em Set de ids ja concluidos. */
export function completedIdsFrom(checkpoint) {
  return new Set(
    Array.isArray(checkpoint?.completedSegmentIds)
      ? checkpoint.completedSegmentIds.map((v) => String(v || '')).filter(Boolean)
      : []
  );
}

/** Cria o controller adaptativo limitado ao tamanho da fila. */
export function createAdaptive(adaptiveOptions, queueLength) {
  if (!adaptiveOptions || queueLength < 2) return null;
  return createAdaptiveController({
    ...adaptiveOptions,
    min: Math.min(adaptiveOptions.min, queueLength),
    max: Math.min(adaptiveOptions.max, queueLength),
    initial: Math.min(adaptiveOptions.initial, queueLength),
  });
}

/**
 * Deduca os caminhos de init/media do resultado de cada trilha.
 *
 * SegmentTemplate: init e media sao arquivos distintos. BaseURL+SegmentBase:
 * o arquivo unico pode ser um init (ftyp/moov, sem mdat) — nesse caso tambem
 * precisa ser unido ao media.
 */
/** Deduca init/media de uma trilha (template, init-only ou arquivo unico). */
function resolveTrack(track) {
  if (!track) return { mediaPath: '', initPath: '' };
  if (track.initPath) return { mediaPath: track.mediaPath || '', initPath: track.initPath };

  const single = track.localPath || track.mediaPath || '';
  const buffer = single ? fs.readFileSync(single) : null;
  return isInitSegment(buffer)
    ? { mediaPath: '', initPath: single }
    : { mediaPath: single, initPath: '' };
}

export function resolveTrackPaths(results) {
  // `results` e o Map do worker (kind -> download), nao um objeto.
  const video = resolveTrack(results?.get?.('video'));
  const audio = resolveTrack(results?.get?.('audio'));
  return { videoPath: video.mediaPath, audioPath: audio.mediaPath, initPath: video.initPath, audioInitPath: audio.initPath };
}

/** Monta o payload de sucesso devolvido ao runner. */
export function buildSuccessResult({
  state, videoRep, audioRep, workDir, ownsTmpDir, controller, emitCheckpoint, paths,
}) {
  const audioPath = paths.audioPath;
  return {
    ok: true,
    mode: audioPath ? 'mux' : 'single',
    videoPath: paths.videoPath,
    audioPath,
    initPath: paths.initPath,
    audioInitPath: paths.audioInitPath,
    totalBytes: state.totalBytes,
    checkpoint: emitCheckpoint({ taskState: 'downloaded', diagnostics: {
      videoRepresentationId: videoRep.id || '',
      audioRepresentationId: audioRep?.id || '',
      totalBytes: state.totalBytes,
    }}),
    diagnostics: {
      videoRepresentationId: videoRep.id || '',
      audioRepresentationId: audioRep?.id || '',
      resumedSegmentCount: state.completedSegmentIds.size,
      workDir,
      adaptive: controller
        ? { enabled: true, finalConcurrency: controller.getConcurrency() }
        : { enabled: false },
    },
    cleanup: ownsTmpDir ? () => fs.rmSync(workDir, { recursive: true, force: true }) : () => {},
  };
}

/** Monta o payload de falha (com fallback para o FFmpeg). */
export function buildFailureResult(err, workDir, ownsTmpDir) {
  if (ownsTmpDir) {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ok */ }
  }
  return {
    ok: false,
    code: err?.code || 'DASH_SEGMENTS_FAILED',
    error: err?.message || 'Falha ao preparar DASH segmentado.',
    status: err?.status || 0,
    fallback: 'ffmpeg',
  };
}