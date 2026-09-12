/**
 * YouTube — InnerTube player API and media URL validation.
 */

import { extractYtConfig } from './page.js';
import { buildYouTubeRequestHeaders } from './headers.js';

export async function fetchYouTubePlayerApi({ videoId, html, headers = {}, timeoutMs = 30000 }) {
  const cfg = extractYtConfig(html);
  const apiKey = cfg?.INNERTUBE_API_KEY || cfg?.INNERTUBE_CONTEXT?.client?.apiKey || '';
  const clientName = cfg?.INNERTUBE_CLIENT_NAME || cfg?.INNERTUBE_CONTEXT?.client?.clientName || 'WEB';
  const clientVersion = cfg?.INNERTUBE_CLIENT_VERSION || cfg?.INNERTUBE_CONTEXT?.client?.clientVersion || '';
  if (!apiKey || !videoId) return null;

  const payload = {
    videoId,
    context: {
      client: { clientName, clientVersion, hl: 'pt-BR', gl: 'BR' },
    },
    contentCheckOk: true,
    racyCheckOk: true,
  };

  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        ...buildYouTubeRequestHeaders(headers),
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': String(clientName),
        ...(clientVersion ? { 'X-YouTube-Client-Version': String(clientVersion) } : {}),
      },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    }
  );
  if (!res.ok) return null;
  return res.json();
}

export async function validateYouTubeMediaUrl(url, headers = {}, timeoutMs = 15000) {
  if (!url) return { ok: false, status: 0, reason: 'missing-url' };
  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { ...buildYouTubeRequestHeaders(headers), Range: 'bytes=0-0' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return { ok: false, status: 0, reason: err?.message || 'network-error' };
  }
  return { ok: res.status === 200 || res.status === 206, status: res.status, finalUrl: res.url || url };
}
