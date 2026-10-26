/**
 * Orquestração do fluxo padrão "analyze -> chooseVariant".
 */

import { readInputUrl, refreshMdstrm } from './url-input.js';
import { resolveAdapterOrExit } from './adapter.js';
import { analyzeAdapterSource } from './sources-adapter.js';
import { analyzeDashSource, analyzeHlsSource } from './sources-playlist.js';

/** Tipos de fonte que usam o fluxo padrao "analyze -> chooseVariant". */
export const ADAPTER_BASED_SOURCES = new Set(['youtube', 'social']);

/**
 * Resolve the URL from clipboard/user input, refreshes mdstrm if needed,
 * resolves the source adapter, analyzes by source type, and chooses variant.
 *
 * Returns `{ url, adapter, sourceType, targetUrl, info, headers, useCurlFlag }`
 * or `{ earlyReturn: { code, ok, ... } }` if the session should end early.
 */
export async function analyzeAndChooseSource({
  answerFn, safeIo, core, headers, forceYouTube, useCurlFlag, legacyFlow,
}) {
  const parsedUrl = await readInputUrl({ answerFn, safeIo });
  if (!parsedUrl) return { earlyReturn: { code: 1, ok: false } };

  headers = { ...headers };
  const url = await refreshMdstrm(parsedUrl, safeIo);

  const resolved = await resolveAdapterOrExit({ url, headers, forceYouTube, answerFn, safeIo });
  if (resolved.earlyReturn) return resolved;

  let adapter = resolved.adapter;
  const { sourceType } = resolved;
  headers = resolved.headers;

  let targetUrl = url;
  let info = null;

  if (ADAPTER_BASED_SOURCES.has(sourceType)) {
    const result = await analyzeAdapterSource({
      url, headers, adapter, sourceType, forceYouTube, answerFn, safeIo, core,
    });
    if (result.earlyReturn) return result;
    ({ adapter, info, targetUrl } = result);
  } else if (sourceType === 'hls' && !useCurlFlag) {
    const result = await analyzeHlsSource({ url, headers, answerFn, safeIo, useCurlFlag, legacyFlow });
    if (result.earlyReturn) return result;
    ({ info, targetUrl, useCurlFlag } = result);
  } else if (sourceType === 'dash') {
    await analyzeDashSource({ url, headers, adapter, safeIo });
  } else if (sourceType === 'direct') {
    safeIo.log('\nArquivo direto detectado. O download seguira sem analise de playlist.');
  }

  return { url, adapter, sourceType, targetUrl, info, headers, useCurlFlag };
}
