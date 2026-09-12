/**
 * Executor — turbo download helpers.
 *
 * HTTP Range paralelo para downloads diretos e mux (video+audio).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startMuxDownload } from '../../../ffmpeg.js';
import { downloadParallelRanges, probeRangeSupport } from '../../../transports/range.js';
import { runStreamDownload } from '../runners/index.js';
import { abortOutcome, makeFfmpegProgress } from '../helpers.js';

/**
 * Tenta baixar uma URL direta com turbo (HTTP Range paralelo).
 * Fallback silencioso para runStreamDownload se Range nao for suportado.
 */
export async function tryTurboDownload(url, output, headers, signal, onProgress, onLog, turboChunks = 8) {
  try {
    await probeRangeSupport(url, { headers, signal, timeoutMs: 5000 });
  } catch (err) {
    onLog?.(`[turbo] servidor nao suporta Range (${err?.message || err}) — fallback sequencial`);
    return null;
  }
  onLog?.('[turbo] servidor aceita Range — baixando em paralelo');
  const result = await downloadParallelRanges({
    url, output, headers, signal,
    concurrency: normalizeTurboChunks(turboChunks),
    onProgress: (p) => onProgress?.({ ...p, stage: 'downloading' }),
  });
  return result.ok ? { ok: true } : null;
}

/**
 * Mux com turbo: baixa video e audio via HTTP Range paralelo, depois
 * mux com FFmpeg (mesmo fallback do runMuxDownload).
 */
export async function runTurboMuxDownload(prepared, output, headers, signal, onProgress, onLog, turboChunks = 8) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-turbo-mux-'));
  const videoTmp = path.join(tmpDir, 'video.mp4');
  const audioTmp = path.join(tmpDir, 'audio.m4a');

  const muxHeaders = { ...headers };
  if (prepared.videoUrl?.includes('googlevideo.com') || prepared.audioUrl?.includes('googlevideo.com')) {
    muxHeaders['Referer'] = muxHeaders['Referer'] || 'https://www.youtube.com/';
    muxHeaders['Origin'] = muxHeaders['Origin'] || 'https://www.youtube.com';
  }

  try {
    const videoResult = await tryTurboDownload(prepared.videoUrl, videoTmp, muxHeaders, signal,
      (u) => onProgress({ ...u, stage: 'downloading', message: 'Baixando video (turbo)' }),
      onLog, turboChunks,
    ) || await runStreamDownload(prepared.videoUrl, videoTmp, muxHeaders, signal,
      (u) => onProgress({ ...u, stage: 'downloading' }),
    );
    if (!videoResult?.ok) return videoResult;
    if (signal?.aborted) return abortOutcome(signal);

    const audioResult = await tryTurboDownload(prepared.audioUrl, audioTmp, muxHeaders, signal,
      (u) => onProgress({ ...u, stage: 'downloading', message: 'Baixando audio (turbo)' }),
      onLog, turboChunks,
    ) || await runStreamDownload(prepared.audioUrl, audioTmp, muxHeaders, signal,
      (u) => onProgress({ ...u, stage: 'downloading' }),
    );
    if (!audioResult?.ok) return audioResult;
    if (signal?.aborted) return abortOutcome(signal);

    onProgress?.({ stage: 'merging', percent: 90, message: 'Juntando video e audio com FFmpeg' });
    const { promise, stop } = startMuxDownload({
      videoInput: videoTmp, audioInput: audioTmp, output,
      onProgress: makeFfmpegProgress((u) => onProgress?.({ ...u, stage: 'merging' }), 0),
    });
    const onAbort = () => stop();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await promise;
      if (signal?.aborted) return abortOutcome(signal);
      if (result.ok) return { ok: true };
      const detail = result.stderr ? ` stderr=${result.stderr.slice(0, 500)}` : '';
      return { ok: false, code: 'MUX_FAILED', error: `ffmpeg mux saiu com codigo ${result.code ?? 'desconhecido'}${detail}` };
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignora */ }
  }
}

export function normalizeTurboChunks(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(32, Math.max(1, Math.floor(n))) : 8;
}
