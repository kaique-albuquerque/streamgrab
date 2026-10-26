/** Constantes de validação dos modelos normalizados. */

export const PROVIDER_RESOLUTION_CONFIDENCE = Object.freeze(['high', 'medium', 'low']);

export const PROVIDER_RESOLUTION_MATCHERS = Object.freeze([
  'url',
  'content-type',
  'html',
  'player',
  'manifest',
  'fallback',
]);

export const DOWNLOAD_PLAN_KINDS = Object.freeze(['direct', 'hls', 'dash', 'mux', 'ytdlp']);

export const PREFERRED_TRANSPORTS = Object.freeze(['http', 'range', 'curl', 'ffmpeg', 'segments', 'ytdlp']);
