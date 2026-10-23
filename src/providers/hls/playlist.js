/** Busca/parse de playlist + montagem de formats/plano. */

import { createFormat } from '../../core/models/index.js';
import { createDownloadPlan, createProviderResolution } from '../../core/download-plan.js';
import { fetchPlaylistText, parsePlaylistText } from '../../hls.js';
import { createHlsMediaInfo, createHlsRequestContext } from './context.js';
import { hlsCapabilities, hlsStrategyHints, supportsMdstrmRefresh } from './capabilities.js';
import { checkHlsDrm } from './drm.js';

export async function analyzePlaylist(url, headers) {
  const { text, url: finalUrl } = await fetchPlaylistText(url, headers);
  checkHlsDrm(text);
  const parsed = parsePlaylistText(text, finalUrl || url);
  return { finalUrl, mediaInfo: createHlsMediaInfo(parsed) };
}

export function buildFormats(media) {
  return (media.variants || []).map((v, i) =>
    createFormat({
      formatId: `hls-${v.height || v.bandwidth || i + 1}`,
      url: v.uri,
      resolution: v.resolution,
      bandwidth: v.bandwidth,
      codecs: v.codecs,
      width: v.width,
      height: v.height,
      container: '',
      hasVideo: true,
      hasAudio: true,
    }),
  );
}

export function buildResolution({ url, finalUrl, mediaInfo, headers }) {
  return createProviderResolution({
    contractVersion: 2,
    providerId: 'hls',
    kind: 'hls',
    sourceUrl: String(url || ''),
    matchedBy: 'url',
    confidence: 'high',
    pageUrl: String(url || ''),
    canonicalUrl: String(finalUrl || url || ''),
    manifestUrl: String(finalUrl || url || ''),
    formats: buildFormats(mediaInfo),
    mediaInfo,
    requestContext: createHlsRequestContext(headers),
    capabilities: hlsCapabilities(url),
    strategyHints: hlsStrategyHints(),
    diagnostics: {},
  });
}

export function buildPlan({ url, selectedUrl, headers }) {
  return createDownloadPlan({
    contractVersion: 2,
    kind: 'hls',
    source: { manifestUrl: String(selectedUrl || url || '') },
    requestContext: createHlsRequestContext(headers),
    selectedFormat: selectedUrl ? { url: String(selectedUrl) } : null,
    capabilities: hlsCapabilities(url),
    strategyHints: hlsStrategyHints(),
    refreshState: {
      entryUrl: String(url || ''),
      selectedUrl: selectedUrl ? String(selectedUrl) : '',
    },
  });
}

export { supportsMdstrmRefresh };
