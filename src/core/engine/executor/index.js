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

import { resolveSourceAdapter, resolveSourceAdapterAsync } from '../../../source-adapters.js';
import { startDownload, startMuxDownload } from '../../../ffmpeg.js';
import { CurlImpersonateTransport } from '../../../transports/curl/index.js';
import { prepareHlsSegmentDownloadToLocal } from '../../../transports/backends/hls-segments/index.js';
import { prepareDashSegmentDownloadToLocal } from '../../../transports/backends/dash-segments/index.js';

import { runMuxStrategy, runMuxMultiStrategy, runHlsDashStrategy, runDirectStrategy } from './strategies.js';

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
  const ctx = { prepareHlsSegments, prepareDashSegments, ffmpegStartDownload, ffmpegStartMuxDownload, curlTransportResolver };

  return {
    async analyze(adapter, { url, headers, auth }) {
      return adapter.analyze({ url, headers, auth });
    },

    async prepare(adapter, { url, analysis, selectedUrl, headers, auth, audioLanguage, allAudio, subtitleLanguages = [], embedSubs = false }) {
      if (typeof adapter.prepareDownloadPlan === 'function') {
        return adapter.prepareDownloadPlan({ url, analysis, selectedUrl, headers, auth, audioLanguage, allAudio, subtitleLanguages, embedSubs });
      }
      return adapter.prepareDownload({ url, analysis, selectedUrl, headers, auth, audioLanguage, allAudio, subtitleLanguages, embedSubs });
    },

    async run({ job, prepared, output, headers, mode, signal, onProgress, atomic, onLog = () => {}, featureFlags = {}, turbo = false, turboChunks = 8 }) {
      const sourceType = job._sourceType || job.meta?.sourceType || '';
      const strategy = prepared.strategy;
      const url = prepared.downloadUrl || prepared.url;

      // mux strategy (yt-dlp / turbo mux / fetch mux)
      if (strategy === 'mux') {
        return runMuxStrategy(job, prepared, output, headers, signal, onProgress, onLog, {
          sourceType, turbo, turboChunks, ...ctx,
        });
      }

      // multi-audio mux strategy
      if (strategy === 'mux-multi') {
        return runMuxMultiStrategy(prepared, output, headers, signal, onProgress);
      }

      if (!url) {
        return { ok: false, code: 'DOWNLOAD_FAILED', error: 'Nenhuma URL de download preparada.' };
      }

      // hls / dash strategy (segments, curl, ffmpeg)
      if (sourceType === 'hls' || sourceType === 'dash') {
        return runHlsDashStrategy(job, prepared, output, headers, signal, onProgress, onLog, {
          sourceType, url, mode, featureFlags, ...ctx,
        });
      }

      // direct download (turbo / stream)
      return runDirectStrategy(url, output, headers, signal, onProgress, onLog, { turbo, turboChunks, atomic });
    },
  };
}
