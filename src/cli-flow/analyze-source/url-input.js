/** Leitura da URL (input/clipboard) e refresh de URLs mdstrm. */

import { extractMdstrmVideoId, needsMdstrmRefresh, refreshMdstrmUrl } from '../../mdstrm.js';
import { getClipboardText, maskUrl, normalizeUrl } from '../../utils.js';

export async function readInputUrl({ answerFn, safeIo }) {
  let rawUrl = (await answerFn('\nURL do video/playlist: ')).trim();
  if (!rawUrl) {
    const clip = getClipboardText();
    if (clip) {
      safeIo.log(`[clipboard] URL copiada detectada: ${maskUrl(clip)}`);
      rawUrl = clip;
    }
  }
  const url = normalizeUrl(rawUrl);
  if (!url) {
    safeIo.error('\n[ERRO] Nenhuma URL informada.');
    return null;
  }
  return url;
}

export async function refreshMdstrm(url, safeIo) {
  if (!needsMdstrmRefresh(url)) return url;

  const videoId = extractMdstrmVideoId(url);
  if (!videoId) return url;

  safeIo.log(`\n[mdstrm] URL da Media Stream detectada (videoId ${videoId}).`);
  safeIo.log('[mdstrm] Buscando credenciais do player no embed publico...');
  try {
    const refreshed = await refreshMdstrmUrl(url);
    safeIo.log(`[mdstrm] URL do player gerada: ${maskUrl(refreshed)}`);
    return refreshed;
  } catch (err) {
    safeIo.log(`[mdstrm] Nao foi possivel converter: ${err.message}`);
    safeIo.log('[mdstrm] Continuando com a URL original.');
    return url;
  }
}
