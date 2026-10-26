/** Headers e deteccao de URLs da Hotmart (player embed). */

import { normalizeHeaders } from '../../utils.js';

export const HOTMART_EMBED_ORIGIN = 'https://cf-embed.play.hotmart.com';
export const HOTMART_EMBED_REFERER = `${HOTMART_EMBED_ORIGIN}/`;
export const HOTMART_EMBED_HEADERS = {
  Accept: '*/*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  Origin: HOTMART_EMBED_ORIGIN,
  Referer: HOTMART_EMBED_REFERER,
  'Sec-Ch-Ua': '"Chromium";v="148", "Google Chrome";v="148", "Not(A)Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
};

export function isHotmartUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'vod-akm.play.hotmart.com'
      || host.endsWith('.play.hotmart.com')
      || host === 'contentplayer.hotmart.com'
      || host.endsWith('.contentplayer.hotmart.com');
  } catch {
    return false;
  }
}

export function hasHotmartFlag(argv = []) {
  return argv.includes('--hotmart');
}

export function getHotmartEmbedHeaders(overrides = {}) {
  return normalizeHeaders({ ...HOTMART_EMBED_HEADERS, ...overrides });
}

export function applyProviderHeaders({ url, headers = {}, argv = [] } = {}) {
  const normalized = normalizeHeaders(headers);
  if (hasHotmartFlag(argv) && isHotmartUrl(url)) {
    return normalizeHeaders({ ...getHotmartEmbedHeaders(), ...normalized });
  }
  return normalized;
}
