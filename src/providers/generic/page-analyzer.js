import { normalizeHeaders, DEFAULT_USER_AGENT } from '../../utils.js';
import { discoverManifestCandidates } from './manifest-discovery.js';
import { detectKnownPlayers } from './player-detectors.js';

function htmlOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function candidatePriority(candidate) {
  const byType = { hls: 300, dash: 250, direct: 200 };
  const byConfidence = { high: 30, medium: 20, low: 10 };
  return (byType[candidate.mediaType] || 0) + (byConfidence[candidate.confidence] || 0);
}

export async function analyzeGenericPage(url, headers = {}, timeoutMs = 30000) {
  const requestHeaders = normalizeHeaders({ 'User-Agent': DEFAULT_USER_AGENT, ...headers });
  const res = await fetch(url, {
    headers: requestHeaders,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`);
    err.status = res.status;
    throw err;
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const finalUrl = res.url || url;
  const html = await res.text();
  const candidates = discoverManifestCandidates(html, finalUrl).sort((a, b) => candidatePriority(b) - candidatePriority(a));
  const players = detectKnownPlayers(html);

  return {
    html,
    finalUrl,
    contentType,
    candidates,
    players,
    origin: htmlOrigin(finalUrl),
    requestHeaders,
  };
}

export default { analyzeGenericPage };
