// ---------------------------------------------------------------------------
// MediaInfo model — normalized analysis result from adapters.
// ---------------------------------------------------------------------------

import { createFormat } from './format.js';

/**
 * Cria um MediaInfo normalizado a partir da analise de um adapter.
 * `formats` e opcional: quando ausente, e derivado de variants quando possivel.
 */
export function createMediaInfo(input = {}) {
  if (input === null || typeof input !== 'object') {
    throw new TypeError('createMediaInfo: entrada deve ser um objeto');
  }

  const rawFormats = Array.isArray(input.formats) ? input.formats : [];
  const progressiveFormats = Array.isArray(input.progressiveFormats)
    ? input.progressiveFormats.map((f) => createFormat(f))
    : [];
  const adaptiveVideoFormats = Array.isArray(input.adaptiveVideoFormats)
    ? input.adaptiveVideoFormats.map((f) => createFormat(f))
    : [];
  const adaptiveAudioFormats = Array.isArray(input.adaptiveAudioFormats)
    ? input.adaptiveAudioFormats.map((f) => createFormat(f))
    : [];
  const variants = Array.isArray(input.variants) ? input.variants : [];

  const formats = rawFormats.length
    ? rawFormats.map((f) => createFormat(f))
    : [...progressiveFormats, ...adaptiveVideoFormats, ...adaptiveAudioFormats];

  return {
    kind: String(input.kind || 'unknown'),
    sourceType: String(input.sourceType || input.kind || 'unknown'),
    provider: String(input.provider || ''),
    title: String(input.title || 'Video'),
    pageUrl: String(input.pageUrl || ''),
    videoId: String(input.videoId || ''),
    durationSeconds: Number(input.durationSeconds || input.duration || 0) || 0,
    formats,
    progressiveFormats,
    adaptiveVideoFormats,
    adaptiveAudioFormats,
    variants,
    audioTracks: Array.isArray(input.audioTracks) ? input.audioTracks : [],
    subtitleTracks: Array.isArray(input.subtitleTracks) ? input.subtitleTracks : [],
  };
}

/** Valida o shape de um MediaInfo. */
export function isValidMediaInfo(info) {
  return (
    info !== null &&
    typeof info === 'object' &&
    typeof info.title === 'string' &&
    typeof info.sourceType === 'string' &&
    Array.isArray(info.formats) &&
    Array.isArray(info.variants)
  );
}
