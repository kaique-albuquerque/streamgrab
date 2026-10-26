/** Resolução do source adapter a partir da URL. */

import { resolveSourceAdapter, resolveSourceAdapterAsync } from '../../source-adapters.js';
import { describeSourceType } from '../../cli/ui.js';
import { sourceLooksLikeYouTubeWatch } from '../../cli/context.js';
import { detectSourceType, maskUrl } from '../../utils.js';
import { isGoogleVideoPlaybackUrl, collectDevtoolsHeaders } from '../../cli/config.js';

/**
 * Resolve o adapter e loga a detecção. Retorna `{ earlyReturn }` quando a
 * fonte não é suportada.
 */
export async function resolveAdapterOrExit({ url, headers, forceYouTube, answerFn, safeIo }) {
  const adapter = forceYouTube && sourceLooksLikeYouTubeWatch(url)
    ? resolveSourceAdapter('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    : await resolveSourceAdapterAsync(url, headers);
  const sourceType = adapter.id;
  if (sourceType === 'unknown') {
    safeIo.error('\n[ERRO] A URL nao parece ser uma fonte suportada.');
    safeIo.error('Use uma URL HTTP/HTTPS contendo ".m3u8", ".mpd", um arquivo direto como ".mp4" / ".webm", ou uma URL sem extensao cujo servidor responda como video/audio (detectado automaticamente).');
    return { earlyReturn: { code: 1, ok: false } };
  }
  safeIo.log(`URL reconhecida: ${maskUrl(url)}`);
  safeIo.log(`Tipo detectado: ${describeSourceType(sourceType)}`);
  if (sourceType === 'direct' && detectSourceType(url) === 'unknown' && adapter.detectedContentType) {
    safeIo.log(`[probe] URL sem extensao, mas o servidor respondeu "${adapter.detectedContentType}" — tratando como midia direta.`);
  }

  if (sourceType === 'direct' && isGoogleVideoPlaybackUrl(url)) {
    headers = await collectDevtoolsHeaders(answerFn, safeIo, headers);
  }

  return { adapter, sourceType, headers };
}
