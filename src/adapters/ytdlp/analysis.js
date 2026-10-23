/**
 * Monta a analise a partir do dump JSON bruto do yt-dlp.
 */

import { ADAPTIVE_URI_PREFIX, YTDLP_FORMAT_UNAVAILABLE } from './constants.js';
import { buildAudioTracks, mapYtDlpFormat, sortFormats, sortVariants } from './format-mapper.js';
import { buildSubtitleTracks } from './subtitles.js';

/** Monta a analise a partir do dump JSON bruto do yt-dlp. */
export function buildAnalysisFromInfo(info, url) {
  const rawFormats = Array.isArray(info?.formats) ? info.formats : [];

  const progressiveFormats = rawFormats
    .filter((f) => f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none' && f.url)
    .map(mapYtDlpFormat)
    .sort(sortFormats);

  const adaptiveVideoFormats = rawFormats
    .filter((f) => f.vcodec && f.vcodec !== 'none' && (!f.acodec || f.acodec === 'none') && f.url)
    .map(mapYtDlpFormat)
    .sort(sortFormats);

  const adaptiveAudioFormats = rawFormats
    .filter((f) => (!f.vcodec || f.vcodec === 'none') && f.acodec && f.acodec !== 'none' && f.url)
    .map(mapYtDlpFormat)
    .sort((a, b) => b.bitrate - a.bitrate || b.itag - a.itag);

  const adaptiveFormats = [...progressiveFormats, ...adaptiveVideoFormats, ...adaptiveAudioFormats].sort(sortFormats);

  if (!progressiveFormats.length && !adaptiveVideoFormats.length) {
    const err = new Error(
      'O yt-dlp nao retornou nenhum formato utilizavel para esta URL (pode ser restrita, ao vivo, protegida por DRM ou indisponivel).'
    );
    err.code = YTDLP_FORMAT_UNAVAILABLE;
    throw err;
  }

  const variants = [
    ...progressiveFormats.map((format) => ({
      uri: format.url,
      resolution: format.qualityLabel || (format.height ? `${format.height}p` : ''),
      width: format.width,
      height: format.height,
      bandwidth: format.bitrate,
      codecs: format.codecs,
      itag: format.itag,
      container: format.container,
      sourceKind: 'progressive',
    })),
    ...adaptiveVideoFormats.map((format) => ({
      uri: `${ADAPTIVE_URI_PREFIX}${format.formatId}`,
      resolution: format.qualityLabel || (format.height ? `${format.height}p` : ''),
      width: format.width,
      height: format.height,
      bandwidth: format.bitrate,
      codecs: format.codecs,
      itag: format.itag,
      container: format.container,
      sourceKind: 'adaptive',
    })),
  ].sort(sortVariants);

  return {
    kind: 'ytdlp',
    pageUrl: url,
    title: info.title || 'Video',
    videoId: info.id || '',
    durationSeconds: Number(info.duration) || 0,
    progressiveFormats,
    adaptiveFormats,
    adaptiveVideoFormats,
    adaptiveAudioFormats,
    hlsManifestUrl: info.hls_manifest_url || '',
    dashManifestUrl: info.dash_manifest_url || '',
    variants,
    // P12: audio tracks + subtitles
    audioTracks: buildAudioTracks(adaptiveAudioFormats),
    subtitleTracks: buildSubtitleTracks(info),
  };
}
