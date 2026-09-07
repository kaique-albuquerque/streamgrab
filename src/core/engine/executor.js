/**
 * Executor padrao — adapta o contrato do engine para os adapters/transportes
 * reais. Injetavel para testes (testes usam mocks deterministicos).
 *
 * Contrato do executor:
 *  - analyze(adapter, { url, headers, auth }) -> analise crua do adapter
 *  - prepare(adapter, { url, analysis, selectedUrl, headers, auth }) -> PreparedDownload
 *  - run({ job, prepared, output, headers, mode, signal, onProgress }) ->
 *      { ok: true } | { ok: false, code, error, status, detail } |
 *      { paused: true } | { cancelled: true }
 */

import { resolveSourceAdapter, resolveSourceAdapterAsync } from '../../source-adapters.js';
import { startDownload, startMuxDownload } from '../../ffmpeg.js';
import { CurlImpersonateTransport } from '../../transports/curl.js';
import { prepareHlsSegmentDownloadToLocal } from '../../transports/backends/hls-segments.js';
import { prepareDashSegmentDownloadToLocal } from '../../transports/backends/dash-segments.js';
import { isMdstrmUrl } from '../../mdstrm.js';
import { resolveTransportWithAutoInstall } from '../mdstrm-routing.js';
import { setJobCheckpoint } from '../models.js';
import { selectStrategyDecision } from '../../strategy/selector.js';

import { safePathname, isMdstrmPlayerUrl } from './helpers.js';
import { isYouTubeUrl } from '../../utils.js';
import { runYtDlpDownload } from '../../transports/ytdlp-runner.js';
import {
  runStreamDownload,
  runFfmpegDownload,
  runCurlHlsDownload,
  runHlsSegmentedDownload,
  runDashSegmentedDownload,
  runMuxDownload,
  runMuxMultiDownload,
} from './runners.js';

/**
 * Resolvedor de adapter padrao: mesma deteccao atual por URL/content-type
 * (forceYouTube usa o adapter youtube). Injetavel para testes sem rede.
 */
export async function defaultResolveAdapter(url, { headers = {}, forceYouTube = false } = {}) {
  if (forceYouTube) {
    return resolveSourceAdapter('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  }
  return resolveSourceAdapterAsync(url, headers);
}

/**
 * Executor padrao: adapters reais + FFmpeg + fetch nativo.
 */
export function createDefaultExecutor({
  prepareHlsSegments = prepareHlsSegmentDownloadToLocal,
  prepareDashSegments = prepareDashSegmentDownloadToLocal,
  ffmpegStartDownload = startDownload,
  ffmpegStartMuxDownload = startMuxDownload,
  curlTransportResolver = (headers) => CurlImpersonateTransport.resolve({ headers }),
} = {}) {
  return {
    async analyze(adapter, { url, headers, auth }) {
      return adapter.analyze({ url, headers, auth });
    },

    async prepare(adapter, { url, analysis, selectedUrl, headers, auth, audioLanguage, allAudio }) {
      if (typeof adapter.prepareDownloadPlan === 'function') {
        return adapter.prepareDownloadPlan({ url, analysis, selectedUrl, headers, auth, audioLanguage, allAudio });
      }
      return adapter.prepareDownload({ url, analysis, selectedUrl, headers, auth, audioLanguage, allAudio });
    },

    async run({ job, prepared, output, headers, mode, signal, onProgress, atomic, onLog = () => {}, featureFlags = {} }) {
      const sourceType = job._sourceType || job.meta?.sourceType || '';
      if (prepared.strategy === 'mux') {
        // P11.1: YouTube adaptive URLs (googlevideo.com) retornam manifests
        // m3u8 em vez de video quando baixados via fetch. O yt-dlp resolve
        // isso internamente: baixa video+audio e faz o mux automaticamente.
        const isYouTube = sourceType === 'ytdlp' || isYouTubeUrl(job.url || '');
        if (isYouTube) {
          const height = prepared.chosenFormat?.height || 1080;
          const formatSelector = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;
          onLog?.(`[yt-dlp] mux strategy: baixando com format="${formatSelector}" via yt-dlp`);
          try {
            await runYtDlpDownload({
              url: job.url,
              formatId: formatSelector,
              output,
              headers,
              auth: job.meta?.auth || {},
              signal,
              onProgress: (p) => onProgress?.({ ...p, stage: 'downloading' }),
            });
            return { ok: true };
          } catch (err) {
            // Se yt-dlp falhar, loga e cai no fallback fetch (runMuxDownload)
            onLog?.(`[yt-dlp] mux fallback para fetch direto: ${err?.message || err}`);
          }
        }
        return runMuxDownload(prepared, output, headers, signal, onProgress);
      }
      // P12.1: multi-audio mux strategy
      if (prepared.strategy === 'mux-multi') {
        return runMuxMultiDownload(prepared, output, headers, signal, onProgress);
      }
      const url = prepared.downloadUrl || prepared.url;
      if (!url) {
        return { ok: false, code: 'DOWNLOAD_FAILED', error: 'Nenhuma URL de download preparada.' };
      }
      if (sourceType === 'hls' || sourceType === 'dash') {
        const plan = prepared._downloadPlan || null;
        const strategyDecision = selectStrategyDecision({
          downloadPlan: plan,
          runtimeCapabilities: {
            ffmpeg: true,
            curl: true,
            hlsSegments: true,
            dashSegments: true,
          },
          featureFlags: featureFlags || job.meta?.featureFlags || {},
        });
        if (sourceType === 'hls' && strategyDecision.backendId === 'hls-segments' && !isMdstrmUrl(url) && !isMdstrmUrl(job.url)) {
          const currentCheckpoint = job.meta?.checkpoint?.backend === 'hls-segments' ? job.meta.checkpoint : null;
          const segmented = await runHlsSegmentedDownload(url, output, headers, signal, onProgress, {
            preferredVariantPath: safePathname(url),
          }, {
            prepareHlsSegments,
            ffmpegStartDownload,
            checkpoint: currentCheckpoint,
            tmpDir: currentCheckpoint?.diagnostics?.workDir || null,
            onCheckpoint: (checkpoint) => setJobCheckpoint(job, checkpoint),
            adaptive:
              featureFlags?.adaptiveSegments || featureFlags?.hlsSegments
                ? { min: 1, max: 6, initial: 2, windowMs: 250 }
                : null,
          });
          if (segmented?.ok) return segmented;
        }
        if (sourceType === 'dash' && strategyDecision.backendId === 'dash-segments') {
          const currentCheckpoint = job.meta?.checkpoint?.backend === 'dash-segments' ? job.meta.checkpoint : null;
          const segmented = await runDashSegmentedDownload(url, output, headers, signal, onProgress, {
            prepareDashSegments,
            ffmpegStartDownload,
            ffmpegStartMuxDownload,
            checkpoint: currentCheckpoint,
            tmpDir: currentCheckpoint?.diagnostics?.workDir || null,
            onCheckpoint: (checkpoint) => setJobCheckpoint(job, checkpoint),
            adaptive:
              featureFlags?.adaptiveSegments || featureFlags?.dashSegments
                ? { min: 1, max: 4, initial: 2, windowMs: 250 }
                : null,
          });
          if (segmented?.ok) return segmented;
        }
        if (isMdstrmUrl(url) || isMdstrmUrl(job.url)) {
          const transport = await resolveTransportWithAutoInstall({
            headers,
            onLog,
            transportResolver: curlTransportResolver,
          });
          if (transport) {
            const preferredVariantPath = safePathname(url);
            const curlEntryUrl = isMdstrmUrl(job.url) || isMdstrmPlayerUrl(job.url) ? job.url : url;
            const curlResult = await runCurlHlsDownload(
              curlEntryUrl,
              output,
              headers,
              signal,
              onProgress,
              transport,
              onLog,
              { preferredVariantPath }
            );
            if (curlResult) return curlResult;
          }
        }
        return runFfmpegDownload(url, output, headers, signal, onProgress, sourceType, mode, Number(job.meta?.durationMs || 0), ffmpegStartDownload);
      }
      return runStreamDownload(url, output, headers, signal, onProgress, atomic);
    },
  };
}
