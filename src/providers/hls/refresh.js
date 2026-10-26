/** Renovação de URL de mídia (mdstrm) preservando a variante selecionada. */

import { refreshMdstrmUrl } from '../../mdstrm.js';
import { supportsMdstrmRefresh } from './capabilities.js';
import { analyzePlaylist } from './playlist.js';

export function resolveFreshVariantByPath(selectedUrl, variants = [], baseUrl = '') {
  let selectedPath = '';
  try {
    selectedPath = new URL(selectedUrl).pathname;
  } catch {
    return null;
  }

  for (const variant of variants) {
    const uri = variant?.uri || variant?.url;
    if (!uri) continue;
    try {
      const absolute = new URL(uri, baseUrl || selectedUrl).toString();
      if (new URL(absolute).pathname === selectedPath) return absolute;
    } catch {
      // ignora variante invalida
    }
  }
  return null;
}

export async function refreshHlsPlan({ currentPlan, refreshAttempt, prepareDownloadPlan }) {
  if (Number(refreshAttempt || 0) >= 2) return null;

  const entryUrl = String(currentPlan?.refreshState?.entryUrl || currentPlan?.source?.manifestUrl || '');
  const selectedUrl = String(currentPlan?.refreshState?.selectedUrl || '');
  if (!supportsMdstrmRefresh(entryUrl) && !supportsMdstrmRefresh(selectedUrl)) return null;

  const refreshedEntryUrl = await refreshMdstrmUrl(entryUrl);
  let refreshedSelectedUrl = '';

  if (selectedUrl) {
    const { mediaInfo } = await analyzePlaylist(refreshedEntryUrl);
    refreshedSelectedUrl = resolveFreshVariantByPath(selectedUrl, mediaInfo.variants, mediaInfo.baseUrl) || '';
  }

  return prepareDownloadPlan({
    url: refreshedEntryUrl,
    selectedUrl: refreshedSelectedUrl || undefined,
    headers: currentPlan?.requestContext?.headers || {},
  });
}
