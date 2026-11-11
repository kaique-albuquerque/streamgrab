/**
 * Estratégia HLS/DASH — download segmentado, curl-impersonate ou FFmpeg.
 *
 * A decisão entre backends vem de `selectStrategyDecision`; cada backend tem
 * um checkpoint próprio para retomar downloads interrompidos.
 */

import { setJobCheckpoint } from '../../models/index.js';
import { selectStrategyDecision } from '../../../strategy/selector.js';
import { isMdstrmUrl } from '../../../mdstrm.js';
import { resolveTransportWithAutoInstall } from '../../mdstrm-routing.js';
import { prepareHlsSegmentDownloadToLocal } from '../../../transports/backends/hls-segments/index.js';
import { prepareDashSegmentDownloadToLocal } from '../../../transports/backends/dash-segments/index.js';
import { startDownload, startMuxDownload } from '../../../ffmpeg.js';
import { CurlImpersonateTransport } from '../../../transports/curl/index.js';

import {
  runFfmpegDownload, runCurlHlsDownload, runHlsSegmentedDownload, runDashSegmentedDownload,
} from '../runners/index.js';
import { safePathname, isMdstrmPlayerUrl } from '../helpers.js';

/** Intervalos de adaptação por backend (segmentos simultâneos). */
const ADAPTIVE = {
  'hls-segments': { min: 1, max: 6, initial: 2, windowMs: 250 },
  'dash-segments': { min: 1, max: 4, initial: 2, windowMs: 250 },
};

/** Configuração de retomada (checkpoint) do backend informado. */
function checkpointFor(job, backendId) {
  return job.meta?.checkpoint?.backend === backendId ? job.meta.checkpoint : null;
}

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
    const currentCheckpoint = checkpointFor(job, 'hls-segments');
    const segmented = await runHlsSegmentedDownload(url, output, headers, signal, onProgress, {
      preferredVariantPath: safePathname(url),
    }, {
      prepareHlsSegments: prepareHlsSegments || prepareHlsSegmentDownloadToLocal,
      ffmpegStartDownload: ffmpegStartDownload || startDownload,
      checkpoint: currentCheckpoint,
      tmpDir: currentCheckpoint?.diagnostics?.workDir || null,
      onCheckpoint: (checkpoint) => setJobCheckpoint(job, checkpoint),
      adaptive: (featureFlags?.adaptiveSegments || featureFlags?.hlsSegments)
        ? ADAPTIVE['hls-segments'] : null,
    });
    if (segmented?.ok) return segmented;
  }

  if (sourceType === 'dash' && strategyDecision.backendId === 'dash-segments') {
    const currentCheckpoint = checkpointFor(job, 'dash-segments');
    const segmented = await runDashSegmentedDownload(url, output, headers, signal, onProgress, {
      prepareDashSegments: prepareDashSegments || prepareDashSegmentDownloadToLocal,
      ffmpegStartDownload: ffmpegStartDownload || startDownload,
      ffmpegStartMuxDownload: ffmpegStartMuxDownload || startMuxDownload,
      checkpoint: currentCheckpoint,
      tmpDir: currentCheckpoint?.diagnostics?.workDir || null,
      onCheckpoint: (checkpoint) => setJobCheckpoint(job, checkpoint),
      adaptive: (featureFlags?.adaptiveSegments || featureFlags?.dashSegments)
        ? ADAPTIVE['dash-segments'] : null,
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