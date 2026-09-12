/**
 * Executor — download strategy routing.
 *
 * Each function receives the full context from the run() call and returns
 * a result: { ok: true } | { ok: false, code, error, status, detail } |
 * { paused: true } | { cancelled: true } | null (continue to next strategy).
 */

import { setJobCheckpoint } from '../../models/index.js';
import { selectStrategyDecision } from '../../../strategy/selector.js';
import { isMdstrmUrl } from '../../../mdstrm.js';
import { resolveTransportWithAutoInstall } from '../../mdstrm-routing.js';
import { isYouTubeUrl } from '../../../utils.js';
import { runYtDlpDownload } from '../../../transports/ytdlp-runner.js';
import { prepareHlsSegmentDownloadToLocal } from '../../../transports/backends/hls-segments/index.js';
import { prepareDashSegmentDownloadToLocal } from '../../../transports/backends/dash-segments/index.js';
import { startDownload, startMuxDownload } from '../../../ffmpeg.js';
import { CurlImpersonateTransport } from '../../../transports/curl/index.js';

import {
  runFfmpegDownload, runCurlHlsDownload, runHlsSegmentedDownload,
  runDashSegmentedDownload, runMuxDownload, runMuxMultiDownload,
} from '../runners/index.js';
import { safePathname, isMdstrmPlayerUrl } from '../helpers.js';
import { tryTurboDownload, runTurboMuxDownload } from './turbo.js';

// -- mux strategy -----------------------------------------------------------

/**
 * Handles 'mux' strategy: YouTube yt-dlp, turbo mux, or fallback fetch mux.
 */
export async function runMuxStrategy(job, prepared, output, headers, signal, onProgress, onLog, {
  sourceType, turbo, turboChunks,
  prepareHlsSegments, prepareDashSegments, ffmpegStartDownload, ffmpegStartMuxDownload, curlTransportResolver,
}) {
  const isYouTube = sourceType === 'ytdlp' || isYouTubeUrl(job.url || '');
  if (isYouTube) {
    const height = prepared.chosenFormat?.height || 1080;
    const formatSelector = `bestvideo[height<=${height}][vcodec*=avc1]+bestaudio[acodec*=mp4a]/best[height<=${height}]`;
    onLog?.(`[yt-dlp] mux strategy: baixando com format="${formatSelector}" via yt-dlp`);
    try {
      await runYtDlpDownload({
        url: job.url, formatId: formatSelector, output, headers,
        auth: job.meta?.auth || {}, signal,
        onProgress: (p) => onProgress?.({ ...p, stage: 'downloading' }),
        subtitleLanguages: job.meta?.subtitleLanguages || [],
        embedSubs: job.meta?.embedSubs === true,
      });
      return { ok: true };
    } catch (err) {
      onLog?.(`[yt-dlp] mux fallback para fetch direto: ${err?.message || err}`);
    }
  }
  if (turbo) {
    onLog?.('[turbo] mux strategy: tentando download paralelo dos streams');
    const result = await runTurboMuxDownload(prepared, output, headers, signal, onProgress, onLog, turboChunks);
    if (result?.ok) return result;
    if (result && !result.ok) onLog?.(`[turbo] mux falhou, fallback para runMuxDownload: ${result.error}`);
  }
  return runMuxDownload(prepared, output, headers, signal, onProgress);
}

// -- mux-multi strategy -----------------------------------------------------

export async function runMuxMultiStrategy(prepared, output, headers, signal, onProgress) {
  return runMuxMultiDownload(prepared, output, headers, signal, onProgress);
}

// -- hls / dash strategy ----------------------------------------------------

export async function runHlsDashStrategy(job, prepared, output, headers, signal, onProgress, onLog, {
  sourceType, url, mode, featureFlags,
  prepareHlsSegments, prepareDashSegments, ffmpegStartDownload, ffmpegStartMuxDownload, curlTransportResolver,
}) {
  const plan = prepared._downloadPlan || null;
  const strategyDecision = selectStrategyDecision({
    downloadPlan: plan,
    runtimeCapabilities: { ffmpeg: true, curl: true, hlsSegments: true, dashSegments: true },
    featureFlags: featureFlags || job.meta?.featureFlags || {},
  });

  if (sourceType === 'hls' && strategyDecision.backendId === 'hls-segments'
    && !isMdstrmUrl(url) && !isMdstrmUrl(job.url)) {
    const currentCheckpoint = job.meta?.checkpoint?.backend === 'hls-segments' ? job.meta.checkpoint : null;
    const segmented = await runHlsSegmentedDownload(url, output, headers, signal, onProgress, {
      preferredVariantPath: safePathname(url),
    }, {
      prepareHlsSegments: prepareHlsSegments || prepareHlsSegmentDownloadToLocal,
      ffmpegStartDownload: ffmpegStartDownload || startDownload,
      checkpoint: currentCheckpoint,
      tmpDir: currentCheckpoint?.diagnostics?.workDir || null,
      onCheckpoint: (checkpoint) => setJobCheckpoint(job, checkpoint),
      adaptive: (featureFlags?.adaptiveSegments || featureFlags?.hlsSegments)
        ? { min: 1, max: 6, initial: 2, windowMs: 250 } : null,
    });
    if (segmented?.ok) return segmented;
  }

  if (sourceType === 'dash' && strategyDecision.backendId === 'dash-segments') {
    const currentCheckpoint = job.meta?.checkpoint?.backend === 'dash-segments' ? job.meta.checkpoint : null;
    const segmented = await runDashSegmentedDownload(url, output, headers, signal, onProgress, {
      prepareDashSegments: prepareDashSegments || prepareDashSegmentDownloadToLocal,
      ffmpegStartDownload: ffmpegStartDownload || startDownload,
      ffmpegStartMuxDownload: ffmpegStartMuxDownload || startMuxDownload,
      checkpoint: currentCheckpoint,
      tmpDir: currentCheckpoint?.diagnostics?.workDir || null,
      onCheckpoint: (checkpoint) => setJobCheckpoint(job, checkpoint),
      adaptive: (featureFlags?.adaptiveSegments || featureFlags?.dashSegments)
        ? { min: 1, max: 4, initial: 2, windowMs: 250 } : null,
    });
    if (segmented?.ok) return segmented;
  }

  if (isMdstrmUrl(url) || isMdstrmUrl(job.url)) {
    const transport = await resolveTransportWithAutoInstall({
      headers, onLog,
      transportResolver: curlTransportResolver || ((h) => CurlImpersonateTransport.resolve({ headers: h })),
    });
    if (transport) {
      const preferredVariantPath = safePathname(url);
      const curlEntryUrl = isMdstrmUrl(job.url) || isMdstrmPlayerUrl(job.url) ? job.url : url;
      const curlResult = await runCurlHlsDownload(curlEntryUrl, output, headers, signal, onProgress, transport, onLog, { preferredVariantPath });
      if (curlResult) return curlResult;
    }
  }

  return runFfmpegDownload(url, output, headers, signal, onProgress, sourceType, mode,
    Number(job.meta?.durationMs || 0), ffmpegStartDownload || startDownload);
}

// -- direct download (HTTP) -------------------------------------------------

export async function runDirectStrategy(url, output, headers, signal, onProgress, onLog, { turbo, turboChunks, atomic }) {
  if (turbo) {
    const turboResult = await tryTurboDownload(url, output, headers, signal, onProgress, onLog, turboChunks);
    if (turboResult) return turboResult;
  }
  const { runStreamDownload } = await import('../runners/index.js');
  return runStreamDownload(url, output, headers, signal, onProgress, atomic);
}
