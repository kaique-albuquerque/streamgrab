/**
 * Runners de download — funcoes concretas que executam o download usando
 * FFmpeg, fetch nativo, curl-impersonate, etc.
 *
 * Cada runner retorna { ok, code, error, ... } padronizado.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { normalizeHeaders, DEFAULT_USER_AGENT } from '../../utils.js';
import { startDownload, startMuxDownload } from '../../ffmpeg.js';
import { ffmpegService } from '../../ffmpeg/service.js';
import { CurlImpersonateTransport } from '../../transports/curl.js';
import { prepareHlsSegmentDownloadToLocal } from '../../transports/backends/hls-segments.js';
import { prepareDashSegmentDownloadToLocal } from '../../transports/backends/dash-segments.js';
import { parsePlaylistText } from '../../hls.js';
import { resolveTransportWithAutoInstall } from '../mdstrm-routing.js';

import {
  progressUpdate,
  abortOutcome,
  segmentProgressToEngine,
  safePathname,
  isMdstrmPlayerUrl,
  makeFfmpegProgress,
} from './helpers.js';

// ---------------------------------------------------------------------------
// Stream download (fetch nativo com validacao de conteudo)
// ---------------------------------------------------------------------------

export async function runStreamDownload(url, output, headers, signal, onProgress, atomic) {
  const started = Date.now();
  let downloaded = 0;
  let total = 0;
  // P7: download atomico opt-in — grava em `.part` e renomeia apos validacao.
  let atomicFile = null;
  if (atomic && typeof atomic.createAtomicFile === 'function') {
    atomicFile = atomic.createAtomicFile({ dir: path.dirname(output), filename: path.basename(output) });
    output = atomicFile.partPath;
  }
  try {
    // P11.1: o fetch do Node nao envia User-Agent por padrao; varios CDNs/WAFs
    // rejeitam com 403 requisicoes sem UA.
    const requestHeaders = normalizeHeaders({ 'User-Agent': DEFAULT_USER_AGENT, ...headers });
    const res = await fetch(url, { headers: requestHeaders, signal, redirect: 'follow' });
    if (!res.ok || !res.body) {
      return { ok: false, code: 'HTTP_ERROR', error: `HTTP ${res.status}`, status: res.status };
    }
    // P11.1: YouTube/CDNs podem retornar HTTP 200 com conteudo que NAO e video
    // (m3u8/HLS manifest, HTML de erro, JSON). Detectamos lendo os
    // primeiros bytes do stream antes de baixar o arquivo inteiro.
    const firstReader = res.body.getReader();
    const { value: firstChunk } = await firstReader.read();
    if (!firstChunk || firstChunk.length === 0) {
      return { ok: false, code: 'EMPTY_RESPONSE', error: 'Resposta vazia do servidor.' };
    }
    const preview = new TextDecoder('utf-8', { fatal: false }).decode(firstChunk.slice(0, 1024));
    // Detecta m3u8/HLS manifest (extensao errada ou mime errado)
    if (/^\s*#EXTM3U/i.test(preview)) {
      return { ok: false, code: 'HLS_MANIFEST', error: `Servidor retornou manifest HLS (m3u8) em vez de video. URL pode ter expirado ou a CDN serviu formato adaptativo. Conteudo: ${preview.slice(0, 200).replace(/\s+/g, ' ').trim()}` };
    }
    // Detecta HTML de erro (login required, 403, etc)
    if (/^\s*<!DOCTYPE|^\s*<html/i.test(preview)) {
      return { ok: false, code: 'HTML_ERROR', error: `Servidor retornou HTML em vez de video. Conteudo: ${preview.slice(0, 200).replace(/\s+/g, ' ').trim()}` };
    }
    // Detecta JSON de erro
    if (/^\s*\{[\s"]*(?:error|message|status)/i.test(preview)) {
      return { ok: false, code: 'JSON_ERROR', error: `Servidor retornou JSON de erro em vez de video. Conteudo: ${preview.slice(0, 200).replace(/\s+/g, ' ').trim()}` };
    }
    // Reconstrói o stream com o primeiro chunk preservado
    const bodyWithPrefix = new ReadableStream({
      start(controller) {
        controller.enqueue(firstChunk);
        const reader2 = res.body.getReader();
        function pump() {
          reader2.read().then(({ done, value }) => {
            if (done) { controller.close(); return; }
            controller.enqueue(value);
            pump();
          }).catch((e) => controller.error(e));
        }
        pump();
      }
    });
    total = Number(res.headers.get('content-length') || 0);
    await fs.promises.mkdir(path.dirname(output), { recursive: true });
    const fh = await fs.promises.open(output, 'w');
    try {
      const reader = bodyWithPrefix.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.byteLength) {
          await fh.write(value, 0, value.byteLength);
          downloaded += value.byteLength;
          onProgress?.(progressUpdate(downloaded, total, started));
        }
      }
    } finally {
      await fh.close().catch(() => {});
    }
    if (signal?.aborted) {
      if (atomicFile) await atomicFile.abort().catch(() => {});
      return abortOutcome(signal);
    }
    if (atomicFile) {
      await atomicFile.commit().catch(() => {});
      if (!fs.existsSync(atomicFile.finalPath)) {
        return { ok: false, code: 'ATOMIC_COMMIT_FAILED', error: 'Falha ao finalizar arquivo.' };
      }
    }
    onProgress?.({ ...progressUpdate(downloaded, total, started), percent: 100 });
    return { ok: true };
  } catch (err) {
    if (atomicFile) await atomicFile.abort().catch(() => {});
    if (signal?.aborted) return abortOutcome(signal);
    return { ok: false, code: err?.code || 'DOWNLOAD_FAILED', error: err.message, status: err?.status };
  }
}

// ---------------------------------------------------------------------------
// FFmpeg download (HLS/DASH direto)
// ---------------------------------------------------------------------------

export async function runFfmpegDownload(url, output, headers, signal, onProgress, sourceType, modeIndex = 0, durationMs = 0, ffmpegDownload = startDownload) {
  const extraArgs = sourceType === 'hls' ? ['-allowed_extensions', 'ALL'] : [];
  const { promise, stop } = ffmpegDownload({
    url,
    output,
    headers,
    modeIndex,
    extraArgs,
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

// ---------------------------------------------------------------------------
// Curl HLS download (curl-impersonate + FFmpeg mux)
// ---------------------------------------------------------------------------

export async function runCurlHlsDownload(
  url,
  output,
  headers,
  signal,
  onProgress,
  transport = null,
  onLog = () => {},
  { preferredVariantPath = '' } = {}
) {
  if (!transport) {
    transport = CurlImpersonateTransport.resolve({ headers });
    if (!transport) return null;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-curl-'));
  const segmentStartedAtMs = Date.now();
  try {
    let mediaText;
    let mediaBase;
    const { text: firstText, finalUrl: firstFinal } = await transport.getText(url, { signal });
    const info = parsePlaylistText(firstText, firstFinal || url);
    if (info.kind === 'master' && info.variants.length > 0) {
      const matched = preferredVariantPath
        ? info.variants.find((variant) => safePathname(new URL(variant.uri, info.baseUrl || firstFinal || url).toString()) === preferredVariantPath)
        : null;
      const picked = matched || info.variants[0];
      const variantUrl = new URL(picked.uri, info.baseUrl || firstFinal || url).toString();
      ({ text: mediaText, finalUrl: mediaBase } = await transport.getText(variantUrl, { signal }));
      mediaBase = mediaBase || variantUrl;
    } else {
      mediaText = firstText;
      mediaBase = firstFinal || url;
    }

    const result = await transport.downloadSegments({
      mediaText,
      mediaBase,
      tmpDir,
      signal,
      onProgress: (p) => onProgress?.(segmentProgressToEngine(p, segmentStartedAtMs)),
    });
    if (!result.ok) {
      const reason = result.error === 'interrupted' ? 'interrupted' : `segmentos (${result.error})`;
      if (signal?.aborted) return abortOutcome(signal);
      return { ok: false, code: 'CURL_SEGMENTS_FAILED', error: `Falha ao baixar ${reason}.` };
    }
    if (signal?.aborted) return abortOutcome(signal);

    onProgress?.({ stage: 'merging', percent: 90, message: 'Juntando segmentos com FFmpeg' });
    const { promise, stop } = startDownload({
      url: result.localPlaylist,
      output,
      headers: {},
      modeIndex: 0,
      extraArgs: result.extraArgs,
      onProgress: makeFfmpegProgress((u) => onProgress?.({ ...u, stage: 'merging' }), 0),
    });
    const onAbort = () => stop();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const muxResult = await promise;
      if (signal?.aborted) return abortOutcome(signal);
      if (muxResult.ok) {
        onProgress?.({ ...progressUpdate(0, 0, Date.now()), percent: 100, stage: 'merging' });
        return { ok: true };
      }
      return {
        ok: false,
        code: 'FFMPEG_FAILED',
        error: `ffmpeg saiu com codigo ${muxResult.code ?? 'desconhecido'}`,
        detail: String(muxResult.stderr || '').slice(-2000),
      };
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  } catch (err) {
    if (signal?.aborted) return abortOutcome(signal);
    return { ok: false, code: err?.code || 'CURL_DOWNLOAD_FAILED', error: err.message, status: err?.status };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignora */
    }
  }
}

// ---------------------------------------------------------------------------
// HLS segmented download
// ---------------------------------------------------------------------------

export async function runHlsSegmentedDownload(
  url,
  output,
  headers,
  signal,
  onProgress,
  { preferredVariantPath = '' } = {},
  {
    prepareHlsSegments = prepareHlsSegmentDownloadToLocal,
    ffmpegStartDownload = startDownload,
    checkpoint = null,
    tmpDir = null,
    onCheckpoint,
    adaptive = null,
  } = {}
) {
  const segmentStartedAtMs = Date.now();
  const prepared = await prepareHlsSegments({
    url,
    headers,
    signal,
    tmpDir: tmpDir || undefined,
    checkpoint,
    preferredVariantPath,
    adaptive,
    onCheckpoint,
    onProgress: (p) => onProgress?.(segmentProgressToEngine(p, segmentStartedAtMs)),
  });
  if (!prepared?.ok) {
    if (prepared.code === 'MANIFEST_UNSUPPORTED') return null;
    if (prepared.code === 'CANCELLED') return abortOutcome(signal);
    return {
      ok: false,
      code: prepared.code || 'HLS_SEGMENTS_FAILED',
      error: prepared.error || 'Falha no backend segmentado HLS.',
      status: prepared.status || 0,
    };
  }

  onProgress?.({ stage: 'merging', percent: 90, message: 'Juntando segmentos HLS com FFmpeg' });
  const { promise, stop } = ffmpegStartDownload({
    url: prepared.localPlaylist,
    output,
    headers: {},
    modeIndex: 0,
    extraArgs: prepared.extraArgs,
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
      ok: false,
      code: 'FFMPEG_FAILED',
      error: `ffmpeg saiu com codigo ${result.code ?? 'desconhecido'}`,
      detail: String(result.stderr || '').slice(-2000),
    };
  } finally {
    signal?.removeEventListener('abort', onAbort);
    prepared.cleanup?.();
  }
}

// ---------------------------------------------------------------------------
// DASH segmented download
// ---------------------------------------------------------------------------

export async function runDashSegmentedDownload(
  url,
  output,
  headers,
  signal,
  onProgress,
  {
    prepareDashSegments = prepareDashSegmentDownloadToLocal,
    ffmpegStartDownload = startDownload,
    ffmpegStartMuxDownload = startMuxDownload,
    checkpoint = null,
    tmpDir = null,
    onCheckpoint,
    adaptive = null,
  } = {}
) {
  const prepared = await prepareDashSegments({
    url,
    headers,
    signal,
    tmpDir: tmpDir || undefined,
    checkpoint,
    adaptive,
    onCheckpoint,
    onProgress: (p) => onProgress?.(segmentProgressToEngine(p, Date.now())),
  });
  if (!prepared?.ok) {
    if (prepared.code === 'MANIFEST_UNSUPPORTED') return null;
    if (prepared.code === 'CANCELLED') return abortOutcome(signal);
    return {
      ok: false,
      code: prepared.code || 'DASH_SEGMENTS_FAILED',
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
          ok: false,
          code: 'MUX_FAILED',
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

// ---------------------------------------------------------------------------
// Mux download (video + audio YouTube)
// ---------------------------------------------------------------------------

export async function runMuxDownload(prepared, output, headers, signal, onProgress) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-mux-'));
  const videoTmp = path.join(tmpDir, 'video.mp4');
  const audioTmp = path.join(tmpDir, 'audio.m4a');
  // P11.1: YouTube CDN requer Referer/Origin para URLs adaptativas temporarias.
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
    // Validacao: arquivos vazios causam ffmpeg exit code estranho (ex: 183).
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
      videoInput: videoTmp,
      audioInput: audioTmp,
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
      return { ok: false, code: 'MUX_FAILED', error: `ffmpeg mux saiu com codigo ${result.code ?? 'desconhecido'}${detail}` };
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignora */
    }
  }
}

// ---------------------------------------------------------------------------
// Multi-audio mux download (P12.1)
// ---------------------------------------------------------------------------

export async function runMuxMultiDownload(prepared, output, headers, signal, onProgress) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-mux-multi-'));
  try {
    // 1) Download video
    const videoTmp = path.join(tmpDir, 'video.mp4');
    const videoResult = await runStreamDownload(
      prepared.videoUrl, videoTmp, headers, signal,
      (u) => onProgress({ ...u, stage: 'downloading', message: 'Baixando video' }),
    );
    if (!videoResult.ok) return videoResult;
    if (signal?.aborted) return abortOutcome(signal);

    // 2) Download each audio track in parallel
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

    // 3) Mux with FFmpeg
    onProgress?.({ stage: 'merging', percent: 90, message: 'Juntando video + audios com FFmpeg' });

    const ffmpegArgs = [
      '-hide_banner', '-loglevel', 'error', '-nostats', '-y',
      '-i', videoTmp,
    ];

    for (const audioTmp of audioTmps) {
      ffmpegArgs.push('-i', audioTmp);
    }

    ffmpegArgs.push('-progress', 'pipe:1');
    ffmpegArgs.push('-map', '0:v:0');
    for (let i = 0; i < audioTmps.length; i++) {
      ffmpegArgs.push('-map', `${i + 1}:a:0`);
    }

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
        ok: false,
        code: 'MUX_MULTI_FAILED',
        error: `ffmpeg mux-multi saiu com codigo ${result.code ?? 'desconhecido'}`,
        detail: String(result.stderr || '').slice(-2000),
      };
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
