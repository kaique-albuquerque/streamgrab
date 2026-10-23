/**
 * P8 — Normalização de MediaInfo/Format (seção 9 do architect.md)
 *
 * Converte a análise crua de qualquer provider (hls/dash/ytdlp/direct) em
 * uma estrutura normalizada para a UI do Electron:
 *
 *   MediaInfo { title, duration, thumbnail, sourceType, provider, protocol,
 *               formats[] }
 *   Format    { id, resolution, videoCodec, audioCodec, container, bitrate,
 *               estimatedSize, hasVideo, hasAudio, url }
 *
 * Módulo puro (sem Electron) — testável em Node. A implementação vive em
 * ./media-info/.
 */

export { formatDuration, estimateSizeBytes } from './media-info/formatters.js';
export {
  normalizeVariantToFormat, normalizeRepresentationToFormat,
} from './media-info/formats.js';
export { normalizeMediaInfo, emptyMediaInfo } from './media-info/normalize.js';
