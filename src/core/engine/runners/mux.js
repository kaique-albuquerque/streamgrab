/**
 * Runner: mux download (video + audio, YouTube adaptive streams).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startMuxDownload } from '../../../ffmpeg.js';
import { ffmpegService } from '../../../ffmpeg/service.js';
import { abortOutcome, makeFfmpegProgress } from '../helpers.js';
import { runStreamDownload } from './stream.js';

/**
 * Downloads video + audio separately, then muxes with FFmpeg.
 * Used for YouTube adaptive format pairs.
 */
export async function runMuxDownload(prepared, output, headers, signal, onProgress) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-mux-'));
  const videoTmp = path.join(tmpDir, 'video.mp4');
  const audioTmp = path.join(tmpDir, 'audio.m4a');
  const muxHeaders = { ...headers };
  if (prepared.videoUrl?.includes('googlevideo.com') || prepared.audioUrl?.includes('googlevideo.com')) {
    muxHeaders['Referer'] = muxHeaders['Referer'] || 'https://www.youtube.com/';
    muxHeaders['Origin'] = muxHeaders['Origin'] || 'https://www.youtube.com';
  }
  try {
    const [video, audio] = await Promise.all([
      runStreamDownload(prepared.videoUrl, videoTmp, muxHeaders, signal, (u) => onProgress({ ...u, stage: 'downloading' })),
      runStreamDownload(prepared.audioUrl, audioTmp, muxHeaders, signal, (u) => onProgress({ ...u, stage: 'downloading' })),
    ]);
    if (signal?.aborted) return abortOutcome(signal);
    if (!video.ok || !audio.ok) {
      const parts = [];
      if (!video.ok) parts.push(`video: ${video.error || 'falha'} (code=${video.code || '?'}, status=${video.status || '?'})`);
      if (!audio.ok) parts.push(`audio: ${audio.error || 'falha'} (code=${audio.code || '?'}, status=${audio.status || '?'})`);
      return { ok: false, code: 'MUX_DOWNLOAD_FAILED', error: `Falha ao baixar video/audio separados: ${parts.join('; ')}` };
    }
    const [videoStat, audioStat] = await Promise.all([
      fs.promises.stat(videoTmp).catch(() => null),
      fs.promises.stat(audioTmp).catch(() => null),
    ]);
    if (!videoStat || videoStat.size === 0) {
      return { ok: false, code: 'MUX_DOWNLOAD_FAILED', error: 'Arquivo de video vazio apos download.' };
    }
    if (!audioStat || audioStat.size === 0) {
      return { ok: false, code: 'MUX_DOWNLOAD_FAILED', error: 'Arquivo de audio vazio apos download.' };
    }
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

/**
 * Downloads video + multiple audio tracks, then muxes all with FFmpeg.
 * Used for P12.1 multi-audio sources.
 */
export async function runMuxMultiDownload(prepared, output, headers, signal, onProgress) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-mux-multi-'));
  try {
    const videoTmp = path.join(tmpDir, 'video.mp4');
    const videoResult = await runStreamDownload(
      prepared.videoUrl, videoTmp, headers, signal,
      (u) => onProgress({ ...u, stage: 'downloading', message: 'Baixando video' }),
    );
    if (!videoResult.ok) return videoResult;
    if (signal?.aborted) return abortOutcome(signal);

    const audioTmps = [];
    const audioUrls = prepared.audioUrls || [];
    for (let i = 0; i < audioUrls.length; i++) {
      const audioTmp = path.join(tmpDir, `audio_${i}.m4a`);
      const label = prepared.audioLabels?.[i] || prepared.audioLanguages?.[i] || `audio ${i + 1}`;
      const result = await runStreamDownload(
        audioUrls[i], audioTmp, headers, signal,
        (u) => onProgress({ ...u, stage: 'downloading', message: `Baixando audio ${i + 1}/${audioUrls.length} (${label})` }),
      );
      if (!result.ok) return result;
      if (signal?.aborted) return abortOutcome(signal);
      audioTmps.push(audioTmp);
    }

    onProgress?.({ stage: 'merging', percent: 90, message: 'Juntando video + audios com FFmpeg' });
    const ffmpegArgs = [
      '-hide_banner', '-loglevel', 'error', '-nostats', '-y',
      '-i', videoTmp,
    ];
    for (const audioTmp of audioTmps) ffmpegArgs.push('-i', audioTmp);
    ffmpegArgs.push('-progress', 'pipe:1');
    ffmpegArgs.push('-map', '0:v:0');
    for (let i = 0; i < audioTmps.length; i++) ffmpegArgs.push('-map', `${i + 1}:a:0`);
    ffmpegArgs.push('-c:v', 'copy', '-c:a', 'copy');
    for (let i = 0; i < audioTmps.length; i++) {
      const lang = prepared.audioLanguages?.[i] || 'und';
      const label = prepared.audioLabels?.[i] || '';
      ffmpegArgs.push('-metadata:s:a:' + i, `language=${lang}`);
      if (label) ffmpegArgs.push('-metadata:s:a:' + i, `title=${label}`);
    }
    ffmpegArgs.push('-movflags', '+faststart', output);

    const { promise, stop } = ffmpegService.run({
      args: ffmpegArgs,
      onProgress: makeFfmpegProgress((u) => onProgress({ ...u, stage: 'merging' }), 0),
    });
    const onAbort = () => stop();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await promise;
      if (signal?.aborted) return abortOutcome(signal);
      if (result.ok) return { ok: true };
      return {
        ok: false, code: 'MUX_MULTI_FAILED',
        error: `ffmpeg mux-multi saiu com codigo ${result.code ?? 'desconhecido'}`,
        detail: String(result.stderr || '').slice(-2000),
      };
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
