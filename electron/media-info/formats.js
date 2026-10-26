/**
 * Conversão de variantes HLS/ytdlp e representações DASH em Format normalizado.
 */

import { formatKbps } from '../../src/utils.js';

/** Converte uma variante HLS/ytdlp (shape legado) em Format normalizado. */
export function normalizeVariantToFormat(variant, index) {
  const height = Number(variant?.height) || 0;
  const width = Number(variant?.width) || 0;
  const bitrate = Number(variant?.bandwidth || variant?.bitrate) || 0;
  const codecParts = String(variant?.codecs || '').split(',');
  const videoCodec = String(codecParts[0] || variant?.vcodec || '');
  const audioCodec = String(codecParts[1] || variant?.acodec || '');
  let resolution = variant?.resolution || '';
  if (!resolution && height) resolution = width ? `${width}x${height}` : `${height}p`;
  return {
    id: variant?.itag ? String(variant.itag) : `f${index + 1}`,
    resolution: resolution || 'Auto',
    videoCodec,
    audioCodec,
    container: String(variant?.container || variant?.ext || 'mp4'),
    bitrate,
    bitrateLabel: bitrate ? formatKbps(bitrate) : '',
    estimatedSize: 0,
    estimatedSizeLabel: '',
    hasVideo: true,
    hasAudio: variant?.hasAudio ?? (variant?.sourceKind !== 'adaptive'),
    url: String(variant?.uri || ''),
    legacyIndex: index,
  };
}

/** Converte uma representação DASH em Format normalizado. */
export function normalizeRepresentationToFormat(rep, index) {
  const height = Number(rep?.height) || 0;
  const width = Number(rep?.width) || 0;
  const bandwidth = Number(rep?.bandwidth) || 0;
  return {
    id: String(rep?.id || `dash-${index + 1}`),
    resolution: rep?.resolution || (width && height ? `${width}x${height}` : height ? `${height}p` : 'Auto'),
    videoCodec: String(rep?.codecs?.split(',')[0] || ''),
    audioCodec: '',
    container: 'mp4',
    bitrate: bandwidth,
    bitrateLabel: bandwidth ? formatKbps(bandwidth) : '',
    estimatedSize: 0,
    estimatedSizeLabel: '',
    hasVideo: true,
    hasAudio: true,
    url: String(rep?.baseUrl || ''),
    legacyIndex: index,
  };
}

/** Format sintético para downloads diretos (uma única "qualidade"). */
export function createDirectFormat(url, container) {
  return {
    id: 'direct',
    resolution: 'Direto',
    videoCodec: '',
    audioCodec: '',
    container,
    bitrate: 0,
    bitrateLabel: '',
    estimatedSize: 0,
    estimatedSizeLabel: '',
    hasVideo: true,
    hasAudio: true,
    url: String(url || ''),
    legacyIndex: 0,
  };
}
