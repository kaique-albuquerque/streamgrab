/** Contexto e mediaInfo derivados de uma playlist HLS já parseada. */

import { DEFAULT_USER_AGENT } from '../../utils.js';
import { createMediaInfo } from '../../core/models/index.js';
import { createRequestContext } from '../../core/request-context.js';

export function createHlsRequestContext(headers = {}) {
  return createRequestContext({
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      ...(headers || {}),
    },
  });
}

export function createHlsMediaInfo(parsed) {
  return {
    ...createMediaInfo({
      kind: parsed.kind,
      sourceType: 'hls',
      provider: 'hls',
      title: '',
      variants: parsed.variants,
      // Playlist de segmentos traz a duracao total via #EXTINF — usada para
      // percentual deterministico no FFmpeg (HLS/DASH).
      durationSeconds: parsed.durationSeconds || 0,
    }),
    baseUrl: parsed.baseUrl || '',
  };
}
