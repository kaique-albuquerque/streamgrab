/**
 * YouTube — page fetch, config extraction, and URL validation.
 */

import { parseJsonAssignment, parseJsonObjectAt } from './parse.js';
import { buildYouTubeRequestHeaders } from './headers.js';

function extractYtConfig(html) {
  const text = String(html || '');
  const direct = parseJsonAssignment(text, 'ytcfg.data_');
  if (direct) {
    try { return JSON.parse(direct); } catch { /* ignore */ }
  }
  const setMatch = text.match(/ytcfg\.set\(\s*\{/);
  if (!setMatch) return {};
  const braceIndex = text.indexOf('{', setMatch.index);
  const raw = parseJsonObjectAt(text, braceIndex);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function extractYouTubeVideoId(url, playerResponse) {
  if (playerResponse?.videoDetails?.videoId) return playerResponse.videoDetails.videoId;
  try {
    const u = new URL(url);
    if (u.hostname.toLowerCase() === 'youtu.be') return u.pathname.replace(/^\/+/, '');
    return u.searchParams.get('v') || '';
  } catch {
    return '';
  }
}

export function isYouTubeWatchUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return host === 'youtube.com' || host === 'www.youtube.com'
      || host === 'm.youtube.com' || host === 'youtu.be';
  } catch {
    return false;
  }
}

export async function fetchYouTubePage(url, headers = {}, timeoutMs = 30000) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': headers['User-Agent'] || headers['user-agent'] || 'Mozilla/5.0',
      ...headers,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`);
    err.status = res.status;
    throw err;
  }
  return { html: await res.text(), finalUrl: res.url || url };
}

export function extractInitialPlayerResponse(html) {
  const raw = parseJsonAssignment(String(html || ''), 'var ytInitialPlayerResponse')
    || parseJsonAssignment(String(html || ''), 'ytInitialPlayerResponse');
  if (!raw) {
    throw new Error('Nao foi possivel localizar ytInitialPlayerResponse na pagina do YouTube.');
  }
  return JSON.parse(raw);
}

/**
 * Builds YouTube InnerTube request headers.
 */
export { buildYouTubeRequestHeaders, extractYtConfig, extractYouTubeVideoId };
