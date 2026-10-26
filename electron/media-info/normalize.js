/**
 * Normalização da análise crua de um provider em MediaInfo.
 */

import { formatBytes } from '../../src/utils.js';
import { detectContainerFromUrl, estimateSizeBytes, formatDuration } from './formatters.js';
import {
  createDirectFormat, normalizeRepresentationToFormat, normalizeVariantToFormat,
} from './formats.js';

const PROTOCOLS = {
  hls: 'HLS',
  dash: 'DASH',
  ytdlp: 'yt-dlp',
  youtube: 'yt-dlp',
  social: 'yt-dlp',
  direct: 'HTTP direto',
  unknown: 'desconhecido',
};

function buildFormats(raw, kind, url) {
  if (kind === 'master' || kind === 'ytdlp' || kind === 'youtube') {
    return (Array.isArray(raw.variants) ? raw.variants : []).map(normalizeVariantToFormat);
  }
  if (kind === 'dash') {
    return (Array.isArray(raw.videoRepresentations) ? raw.videoRepresentations : []).map(
      normalizeRepresentationToFormat
    );
  }
  if (kind === 'direct' || kind === 'media' || kind === 'unknown') {
    return [createDirectFormat(url, detectContainerFromUrl(url) || 'bin')];
  }
  return [];
}

/**
 * Normaliza a análise crua de um provider em MediaInfo.
 *
 * Aceita o shape legado retornado pelos adapters/providers:
 *  - master HLS: { kind:'master', variants[], baseUrl }
 *  - dash:       { kind:'dash', videoRepresentations[], baseUrl }
 *  - ytdlp:      { kind:'ytdlp', variants[], title, durationSeconds, thumbnail }
 *  - direct:     { kind:'direct', totalDuration }
 *  - media única: { kind:'media'|'unknown' }
 */
export function normalizeMediaInfo(raw = {}, { url = '', baseUrl = '', sourceType = '', provider = '' } = {}) {
  const kind = raw?.kind || 'unknown';
  const detectedSource = sourceType || raw?.sourceType || (kind === 'ytdlp' ? 'ytdlp' : kind);
  const protocol = PROTOCOLS[detectedSource] || PROTOCOLS[kind] || PROTOCOLS.unknown;

  const durationSeconds = Number(raw?.durationSeconds || raw?.totalDuration || 0) || 0;
  const title = String(raw?.title || 'Video');
  const thumbnail = String(raw?.thumbnail || raw?.thumbnails?.[0]?.url || '');

  const formats = buildFormats(raw, kind, url);

  // Tamanho estimado quando bitrate + duração conhecidos.
  for (const f of formats) {
    if (f.bitrate > 0 && durationSeconds > 0) {
      f.estimatedSize = estimateSizeBytes(f.bitrate, durationSeconds);
      f.estimatedSizeLabel = formatBytes(f.estimatedSize);
    }
  }

  const best = formats.find((f) => f.hasVideo) || null;

  return {
    title,
    duration: durationSeconds,
    durationLabel: formatDuration(durationSeconds),
    thumbnail,
    sourceType: detectedSource,
    protocol,
    provider: String(raw?.provider || provider || detectedSource),
    kind,
    baseUrl: String(baseUrl || raw?.baseUrl || url),
    pageUrl: String(raw?.pageUrl || url),
    formats,
    best,
    resolution: best?.resolution || '',
    codecs: best?.videoCodec || '',
    container: best?.container || '',
    bitrate: best?.bitrate || 0,
    bitrateLabel: best?.bitrateLabel || '',
    estimatedSize: best?.estimatedSize || 0,
    estimatedSizeLabel: best?.estimatedSizeLabel || '',
    // P12.1: audio tracks + subtitles (pass through from adapter)
    audioTracks: Array.isArray(raw?.audioTracks) ? raw.audioTracks : [],
    subtitleTracks: Array.isArray(raw?.subtitleTracks) ? raw.subtitleTracks : [],
  };
}

/** Cria um MediaInfo para fontes desconhecidas/erro (shape sempre estável). */
export function emptyMediaInfo({ url = '', sourceType = 'unknown', provider = '' } = {}) {
  return normalizeMediaInfo({ kind: sourceType || 'unknown' }, { url, sourceType, provider });
}
