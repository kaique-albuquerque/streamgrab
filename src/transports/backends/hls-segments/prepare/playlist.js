/**
 * HLS segments — resolução da playlist media (master → variante).
 */

import { fetchPlaylistText, parsePlaylistText } from '../../../../hls.js';
import { safePathname } from '../fetch.js';

/**
 * Busca a playlist media, resolvendo a variante quando a URL é um master.
 *
 * @returns {Promise<{ mediaText: string, mediaBase: string }>}
 */
export async function fetchMediaPlaylist({ url, headers, preferredVariantPath = '' }) {
  const first = await fetchPlaylistText(url, headers);
  const info = parsePlaylistText(first.text, first.url || url);
  const base = info.baseUrl || first.url || url;

  if (info.kind === 'master' && info.variants.length > 0) {
    const matched = preferredVariantPath
      ? info.variants.find((v) => safePathname(new URL(v.uri, base).toString()) === preferredVariantPath)
      : null;
    const picked = matched || info.variants[0];
    const variantUrl = new URL(picked.uri, base).toString();
    const variant = await fetchPlaylistText(variantUrl, headers);
    return { mediaText: variant.text, mediaBase: variant.url || variantUrl };
  }

  return { mediaText: first.text, mediaBase: first.url || url };
}
