/**
 * YouTube — barrel re-export and top-level analysis/preparation functions.
 */

import { extractPlayerJsUrl, fetchPlayerJs, resolveCipherFormats } from '../youtube-signature/index.js';
import { normalizeYouTubeFormat, isResolvableDirectFormat, sortFormats, sortVariants } from './formats.js';
import { fetchYouTubePage, extractInitialPlayerResponse, extractYouTubeVideoId } from './page.js';
import { fetchYouTubePlayerApi, validateYouTubeMediaUrl } from './player.js';
import { buildCandidatePlans, parseManifestSelection } from './plans.js';
import { buildManifestVariants } from './manifests.js';

// Re-export public API for backward compatibility
export { isYouTubeWatchUrl, fetchYouTubePage, extractInitialPlayerResponse } from './page.js';

export function parseYouTubePlayerResponse(playerResponse, pageUrl = '', extraVariants = []) {
  const videoDetails = playerResponse?.videoDetails || {};
  const streamingData = playerResponse?.streamingData || {};

  const progressiveFormats = (streamingData.formats || [])
    .map(normalizeYouTubeFormat)
    .filter((f) => f.url && f.hasVideo && f.hasAudio)
    .sort(sortFormats);

  const adaptiveFormats = (streamingData.adaptiveFormats || [])
    .map(normalizeYouTubeFormat)
    .sort(sortFormats);

  const adaptiveVideoFormats = adaptiveFormats
    .filter((f) => f.hasVideo && !f.hasAudio && isResolvableDirectFormat(f))
    .sort(sortFormats);

  const adaptiveAudioFormats = adaptiveFormats
    .filter((f) => f.hasAudio && !f.hasVideo && isResolvableDirectFormat(f))
    .sort((a, b) => b.bitrate - a.bitrate || b.itag - a.itag);

  const variants = [
    ...progressiveFormats.map((f) => ({
      uri: f.url,
      resolution: f.qualityLabel || (f.height ? `${f.height}p` : ''),
      width: f.width, height: f.height, bandwidth: f.bitrate,
      codecs: f.codecs, itag: f.itag, container: f.container,
      sourceKind: 'progressive',
    })),
    ...adaptiveVideoFormats.map((f) => ({
      uri: `youtube-adaptive:${f.itag}`,
      resolution: f.qualityLabel || (f.height ? `${f.height}p` : ''),
      width: f.width, height: f.height, bandwidth: f.bitrate,
      codecs: f.codecs, itag: f.itag, container: f.container,
      sourceKind: 'adaptive',
    })),
    ...extraVariants,
  ].sort(sortVariants);

  return {
    kind: 'youtube', pageUrl,
    title: videoDetails.title || 'YouTube Video',
    videoId: videoDetails.videoId || '',
    durationSeconds: Number(videoDetails.lengthSeconds) || 0,
    progressiveFormats, adaptiveFormats,
    adaptiveVideoFormats, adaptiveAudioFormats,
    hlsManifestUrl: streamingData.hlsManifestUrl || '',
    dashManifestUrl: streamingData.dashManifestUrl || '',
    variants,
  };
}

export async function analyzeYouTubeUrl(url, headers = {}) {
  const { html, finalUrl } = await fetchYouTubePage(url, headers);
  let playerResponse = extractInitialPlayerResponse(html);
  const videoId = extractYouTubeVideoId(finalUrl || url, playerResponse);

  if (!playerResponse?.streamingData && videoId) {
    try {
      const apiResp = await fetchYouTubePlayerApi({ videoId, html, headers });
      if (apiResp?.streamingData) {
        playerResponse = {
          ...playerResponse, ...apiResp,
          streamingData: apiResp.streamingData,
          videoDetails: apiResp.videoDetails || playerResponse.videoDetails,
          playabilityStatus: apiResp.playabilityStatus || playerResponse.playabilityStatus,
        };
      }
    } catch { /* segue com a resposta do HTML */ }
  }

  const playerJsUrl = extractPlayerJsUrl(html, finalUrl);
  if (playerJsUrl) {
    try {
      const playerJsText = await fetchPlayerJs(playerJsUrl, headers);
      if (playerResponse?.streamingData) {
        playerResponse.streamingData.formats =
          resolveCipherFormats(playerResponse.streamingData.formats, playerJsText);
        playerResponse.streamingData.adaptiveFormats =
          resolveCipherFormats(playerResponse.streamingData.adaptiveFormats, playerJsText);
      }
    } catch { /* segue com os formatos ja resolvidos */ }
  }

  const manifestVariants = await buildManifestVariants(playerResponse?.streamingData, headers);
  const parsed = parseYouTubePlayerResponse(playerResponse, finalUrl, manifestVariants);

  if (!parsed.progressiveFormats.length && !parsed.adaptiveVideoFormats.length
    && !parsed.dashManifestUrl && !parsed.hlsManifestUrl) {
    const err = new Error(
      'Nenhum formato do YouTube com URL direta ou manifesto utilizavel foi encontrado.'
    );
    err.code = 'YOUTUBE_DIRECT_FORMAT_UNAVAILABLE';
    err.playerResponse = playerResponse;
    throw err;
  }

  return parsed;
}

export async function prepareYouTubeDownload({ analysis, selectedUrl, headers = {} }) {
  const manifestSelection = parseManifestSelection(selectedUrl);

  if (manifestSelection === 'dash' && analysis?.dashManifestUrl) {
    return {
      strategy: 'single',
      downloadUrl: analysis.dashManifestUrl,
      chosenFormat: { sourceKind: 'manifest-dash' },
    };
  }
  if (manifestSelection === 'hls' && analysis?.hlsManifestUrl) {
    return {
      strategy: 'single',
      downloadUrl: analysis.hlsManifestUrl,
      chosenFormat: { sourceKind: 'manifest-hls' },
    };
  }

  const candidates = buildCandidatePlans(analysis, selectedUrl);
  if (!candidates.length) {
    const err = new Error('Nao foi possivel resolver URLs do YouTube para download.');
    err.code = 'YOUTUBE_DOWNLOAD_URL_MISSING';
    throw err;
  }

  let lastFailure = null;
  for (const c of candidates) {
    if (c.strategy === 'single' || c.strategy === 'manifest') {
      const probe = await validateYouTubeMediaUrl(c.downloadUrl, headers);
      if (probe.ok) {
        return c.strategy === 'manifest'
          ? { strategy: 'single', downloadUrl: c.downloadUrl,
              chosenFormat: { sourceKind: `manifest-${c.manifestType}` } }
          : c;
      }
      lastFailure = `${c.strategy}:${probe.status || probe.reason}`;
      continue;
    }
    const videoProbe = await validateYouTubeMediaUrl(c.videoUrl, headers);
    if (!videoProbe.ok) { lastFailure = `video:${videoProbe.status || videoProbe.reason}`; continue; }
    const audioProbe = await validateYouTubeMediaUrl(c.audioUrl, headers);
    if (!audioProbe.ok) { lastFailure = `audio:${audioProbe.status || audioProbe.reason}`; continue; }
    return c;
  }

  const err = new Error('As URLs de midia do YouTube foram resolvidas, mas nenhuma passou na validacao.');
  err.code = 'YOUTUBE_DOWNLOAD_URL_INVALID';
  err.details = lastFailure;
  throw err;
}
