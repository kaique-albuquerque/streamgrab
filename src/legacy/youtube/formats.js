/**
 * YouTube — format normalization and sorting helpers.
 */

import { parseMimeType } from './parse.js';

export function normalizeYouTubeFormat(format) {
  const { mime, container, codecs } = parseMimeType(format);
  return {
    itag: Number(format?.itag) || 0,
    url: format?.url || '',
    mimeType: mime,
    container,
    codecs,
    qualityLabel: format?.qualityLabel || '',
    bitrate: Number(format?.bitrate) || 0,
    width: Number(format?.width) || 0,
    height: Number(format?.height) || 0,
    audioQuality: format?.audioQuality || '',
    hasVideo: Number(format?.width) > 0 || /video\//i.test(mime),
    hasAudio: Boolean(format?.audioQuality) || /mp4a|opus|vorbis|audio\//i.test(`${mime} ${codecs}`),
    contentLength: Number(format?.contentLength) || 0,
    signatureCipher: format?.signatureCipher || format?.cipher || '',
  };
}

export function isResolvableDirectFormat(format) {
  return Boolean(format.url);
}

export function sortFormats(a, b) {
  return b.height - a.height || b.bitrate - a.bitrate || b.itag - a.itag;
}

export function sortVariants(a, b) {
  const scoreA = `${a.sourceKind || ''}` === 'adaptive' ? 1 : 0;
  const scoreB = `${b.sourceKind || ''}` === 'adaptive' ? 1 : 0;
  return scoreB - scoreA
    || (b.height || 0) - (a.height || 0)
    || (b.bandwidth || 0) - (a.bandwidth || 0)
    || (b.itag || 0) - (a.itag || 0);
}
