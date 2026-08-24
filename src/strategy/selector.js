/**
 * StrategySelector puro e deterministico.
 *
 * Esta etapa ainda mapeia para os ids de estrategia legados do runtime atual,
 * mas ja devolve metadados estruturados de motivo/diagnostico para permitir a
 * evolucao para backends dedicados sem espalhar regras no engine.
 */

export const BACKEND_IDS = Object.freeze({
  MUX: 'mux',
  DIRECT_HTTP: 'http',
  DIRECT_RANGE: 'range',
  HLS_FFMPEG: 'ffmpeg',
  DASH_FFMPEG: 'ffmpeg',
  CURL: 'curl',
  YTDLP: 'ytdlp',
});

function pickPlanKind(input = {}) {
  return String(
    input.downloadPlan?.kind ||
    input.plan?.kind ||
    input.prepared?._downloadPlan?.kind ||
    input.prepared?.strategy ||
    input.sourceType ||
    '',
  ).toLowerCase();
}

function pickPreferredTransport(input = {}) {
  return String(
    input.downloadPlan?.strategyHints?.preferredTransport ||
    input.plan?.strategyHints?.preferredTransport ||
    input.prepared?._downloadPlan?.strategyHints?.preferredTransport ||
    '',
  ).toLowerCase();
}

function normalizeCapabilities(input = {}) {
  const runtimeCapabilities = input.runtimeCapabilities || {};
  const featureFlags = input.featureFlags || {};
  return {
    ytdlpDownload: Boolean(input.options?.useYtDlpDownload || runtimeCapabilities.ytdlpDownload),
    range: runtimeCapabilities.range !== false,
    ffmpeg: runtimeCapabilities.ffmpeg !== false,
    curl: runtimeCapabilities.curl === true,
    hlsSegments: Boolean(featureFlags.hlsSegments && runtimeCapabilities.hlsSegments),
    dashSegments: Boolean(featureFlags.dashSegments && runtimeCapabilities.dashSegments),
  };
}

function result(strategy, backendId, reasonCode, reason) {
  return { strategy, backendId, reasonCode, reason };
}

export function selectStrategyDecision(input = {}) {
  const kind = pickPlanKind(input);
  const preferredTransport = pickPreferredTransport(input);
  const prepared = input.prepared || {};
  const options = input.options || {};
  const caps = normalizeCapabilities(input);

  if (prepared.strategy === 'mux' || kind === 'mux') {
    return result(BACKEND_IDS.MUX, 'mux', 'prepared-mux', 'Prepared download requires mux of separate streams');
  }

  if (kind === 'hls') {
    if (preferredTransport === 'segments' && caps.hlsSegments) {
      return result('ffmpeg', 'hls-segments', 'hls-segments', 'HLS segmented backend selected with ffmpeg mux compatibility');
    }
    return result(BACKEND_IDS.HLS_FFMPEG, 'hls-ffmpeg', 'hls-ffmpeg', 'HLS uses ffmpeg compatibility backend');
  }

  if (kind === 'dash') {
    if (preferredTransport === 'segments' && caps.dashSegments) {
      return result('ffmpeg', 'dash-segments', 'dash-segments', 'DASH segmented backend selected with ffmpeg compatibility');
    }
    return result(BACKEND_IDS.DASH_FFMPEG, 'dash-ffmpeg', 'dash-ffmpeg', 'DASH uses ffmpeg compatibility backend');
  }

  if (kind === 'ytdlp' || kind === 'youtube' || kind === 'social') {
    if (caps.ytdlpDownload && options.formatId) {
      return result(BACKEND_IDS.YTDLP, 'ytdlp', 'ytdlp-runner', 'yt-dlp download runner explicitly requested for selected format');
    }
    return result(BACKEND_IDS.DIRECT_HTTP, 'direct-http', 'ytdlp-http-default', 'Provider remains on HTTP compatibility path by default');
  }

  if (kind === 'direct') {
    if (preferredTransport === 'range' && caps.range) {
      return result(BACKEND_IDS.DIRECT_RANGE, 'direct-range', 'direct-range-hint', 'Provider requested range transport for direct media');
    }
    if (options.turbo && caps.range) {
      return result(BACKEND_IDS.DIRECT_RANGE, 'direct-range', 'direct-range-turbo', 'Turbo mode enables range transport for direct media');
    }
    return result(BACKEND_IDS.DIRECT_HTTP, 'direct-http', 'direct-http-default', 'Direct media defaults to sequential HTTP');
  }

  return result(BACKEND_IDS.DIRECT_HTTP, 'direct-http', 'safe-default-http', 'Unknown source falls back to safe HTTP default');
}

export function selectStrategy(downloadPlan, runtimeCapabilities = {}, featureFlags = {}) {
  return selectStrategyDecision({ downloadPlan, runtimeCapabilities, featureFlags }).strategy;
}

export default { BACKEND_IDS, selectStrategyDecision, selectStrategy };
