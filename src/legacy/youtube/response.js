/**
 * YouTube — normalização do playerResponse em catálogo de formatos/variantes.
 */

import { normalizeYouTubeFormat, isResolvableDirectFormat, sortFormats, sortVariants } from './formats.js';

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
