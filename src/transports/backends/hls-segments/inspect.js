/**
 * HLS segments — manifest inspection / validation.
 */

const SEGMENT_WORKERS = 6;
const SEGMENT_ATTEMPTS = 3;

export { SEGMENT_WORKERS, SEGMENT_ATTEMPTS };

function createUnsupportedResult(reasonCode, reason) {
  return {
    ok: false,
    code: 'MANIFEST_UNSUPPORTED',
    reasonCode,
    error: reason,
    fallback: 'ffmpeg',
  };
}

function hasLine(text, pattern) {
  return pattern.test(String(text || ''));
}

export function inspectHlsSegmentSupport(text) {
  if (!String(text || '').includes('#EXTM3U')) {
    return createUnsupportedResult('not-hls', 'Manifesto nao parece ser HLS.');
  }
  if (hasLine(text, /^#EXT-X-BYTERANGE:/m)) {
    return createUnsupportedResult('hls-byterange-unsupported', 'EXT-X-BYTERANGE ainda nao e suportado pelo backend segmentado.');
  }
  if (hasLine(text, /^#EXT-X-PLAYLIST-TYPE:\s*EVENT/im)) {
    return createUnsupportedResult('hls-live-unsupported', 'Playlist EVENT ainda nao e suportada pelo backend segmentado.');
  }
  if (!hasLine(text, /^#EXT-X-ENDLIST\s*$/m)) {
    return createUnsupportedResult('hls-live-unsupported', 'Somente playlists VOD com EXT-X-ENDLIST sao suportadas nesta fase.');
  }
  if (hasLine(text, /^#EXT-X-KEY:.*METHOD=SAMPLE-AES/im)) {
    return createUnsupportedResult('hls-sample-aes-unsupported', 'SAMPLE-AES ainda nao e suportado pelo backend segmentado.');
  }
  if (hasLine(text, /^#EXT-X-SESSION-KEY:/m)) {
    return createUnsupportedResult('hls-session-key-unsupported', 'EXT-X-SESSION-KEY ainda nao e suportado pelo backend segmentado.');
  }
  return { ok: true };
}

export { createUnsupportedResult };
