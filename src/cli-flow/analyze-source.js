/**
 * CLI flow — source analysis and variant choosing.
 */

import { fetchPlaylist } from '../hls.js';
import { needsMdstrmRefresh, extractMdstrmVideoId, refreshMdstrmUrl } from '../mdstrm.js';
import { resolveSourceAdapter, resolveSourceAdapterAsync } from '../source-adapters.js';
import { maskUrl, formatKbps, detectSourceType, normalizeUrl, getClipboardText } from '../utils.js';
import { print403, chooseVariant, describeSourceType } from '../cli/ui.js';
import { isGoogleVideoPlaybackUrl, collectDevtoolsHeaders } from '../cli/config.js';
import { sourceLooksLikeYouTubeWatch } from '../cli/context.js';

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
  let rawUrl = (await answerFn('\nURL do video/playlist: ')).trim();
  if (!rawUrl) {
    const clip = getClipboardText();
    if (clip) {
      safeIo.log(`[clipboard] URL copiada detectada: ${maskUrl(clip)}`);
      rawUrl = clip;
    }
  }
  let url = normalizeUrl(rawUrl);
  if (!url) {
    safeIo.error('\n[ERRO] Nenhuma URL informada.');
    return { earlyReturn: { code: 1, ok: false } };
  }
  headers = { ...headers };

  // mdstrm refresh
  if (needsMdstrmRefresh(url)) {
    const videoId = extractMdstrmVideoId(url);
    if (videoId) {
      safeIo.log(`\n[mdstrm] URL da Media Stream detectada (videoId ${videoId}).`);
      safeIo.log('[mdstrm] Buscando credenciais do player no embed publico...');
      try {
        const refreshed = await refreshMdstrmUrl(url);
        safeIo.log(`[mdstrm] URL do player gerada: ${maskUrl(refreshed)}`);
        url = refreshed;
      } catch (err) {
        safeIo.log(`[mdstrm] Nao foi possivel converter: ${err.message}`);
        safeIo.log('[mdstrm] Continuando com a URL original.');
      }
    }
  }

  let adapter = forceYouTube && sourceLooksLikeYouTubeWatch(url)
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

  let targetUrl = url;
  let info = null;

  if (ADAPTER_BASED_SOURCES.has(sourceType)) {
    safeIo.onState?.({ state: 'analyzing' });
    safeIo.log(`\nAnalisando ${describeSourceType(sourceType)}...`);
    try {
      const analysis = await core.analyze(url, {
        headers, auth: undefined,
        forceYouTube: forceYouTube && sourceLooksLikeYouTubeWatch(url),
      });
      adapter = analysis.adapter;
      info = analysis.info;
      safeIo.log(`Video detectado: ${info.title}`);
      if (info.progressiveFormats?.length) {
        safeIo.log(`Formatos progressivos disponiveis: ${info.progressiveFormats.length}`);
      }
      if (info.adaptiveVideoFormats?.length && info.adaptiveAudioFormats?.length) {
        safeIo.log(`Formatos adaptativos disponiveis: ${info.adaptiveVideoFormats.length} videos + ${info.adaptiveAudioFormats.length} audios`);
      }
      const chosen = await chooseVariant(answerFn, safeIo, info.variants, '');
      if (!chosen) {
        safeIo.log('\nCancelado.');
        return { earlyReturn: { code: 0, ok: false, cancelled: true } };
      }
      targetUrl = chosen;
      safeIo.log(`Formato escolhido: ${chosen}`);
    } catch (err) {
      safeIo.error(`\n[ERRO] ${err.message}`);
      if (err.needsAuth) {
        safeIo.error('\nDica: o conteudo parece exigir login.');
        safeIo.error('  1. Instale a extensao "Get cookies.txt LOCALLY" no Chrome/Edge/Firefox e exporte os cookies do site.');
        safeIo.error('  2. Rode:  node src/index.js --cookies cookies.txt');
        safeIo.error('  3. Ou extraia direto do navegador:  node src/index.js --cookies-from-browser chrome');
      }
      return { earlyReturn: { code: 1, ok: false, error: err.code || sourceType } };
    }
  } else if (sourceType === 'hls' && !useCurlFlag) {
    safeIo.onState?.({ state: 'analyzing' });
    safeIo.log('\nAnalisando playlist...');
    let infoPlaylist = null;
    try {
      infoPlaylist = await fetchPlaylist(url, headers);
    } catch (err) {
      if (err.status === 403) {
        print403(safeIo);
        const ans = (await answerFn('\nO servidor parece bloquear clientes que nao sejam navegadores.\nTentar contornar com curl-impersonate (imita o TLS de um navegador real)? (S/n): '))
          .trim().toUpperCase();
        if (ans.startsWith('N')) return { earlyReturn: { code: 1, ok: false } };
        if (!legacyFlow) {
          useCurlFlag = true;
          safeIo.log('\nAtivando o modo curl-impersonate...');
        } else {
          safeIo.log('[legacy] Modo curl-impersonate desativado pelo rollback STREAMGRAB_LEGACY_FLOW.');
        }
      } else {
        safeIo.log(`[AVISO] Nao foi possivel analisar a playlist (${err.message}).`);
        safeIo.log('O download tentara usar a URL fornecida diretamente.');
      }
    }
    if (!useCurlFlag && infoPlaylist?.kind === 'master' && infoPlaylist.variants.length > 0) {
      const chosen = await chooseVariant(answerFn, safeIo, infoPlaylist.variants, infoPlaylist.baseUrl || url);
      if (!chosen) {
        safeIo.log('\nCancelado.');
        return { earlyReturn: { code: 0, ok: false, cancelled: true } };
      }
      targetUrl = chosen;
      safeIo.log(`Variant escolhida: ${maskUrl(targetUrl)}`);
    } else if (!useCurlFlag && infoPlaylist?.kind === 'unknown') {
      safeIo.log('[AVISO] A playlist nao parece ser HLS padrao. Continuando mesmo assim.');
    }
    info = infoPlaylist;
  } else if (sourceType === 'dash') {
    safeIo.onState?.({ state: 'analyzing' });
    safeIo.log('\nAnalisando manifesto DASH...');
    try {
      const dashInfo = await adapter.analyze({ url, headers });
      const topVideo = dashInfo.videoRepresentations[0];
      if (topVideo) {
        safeIo.log(`Representacoes de video encontradas: ${dashInfo.videoRepresentations.length}`);
        safeIo.log(`Melhor representacao detectada: ${topVideo.resolution || 'sem resolucao'}${topVideo.bandwidth ? `  ~${formatKbps(topVideo.bandwidth)}` : ''}`);
      } else {
        safeIo.log('Manifesto DASH carregado. O FFmpeg tentara resolver as representacoes automaticamente.');
      }
    } catch (err) {
      safeIo.log(`[AVISO] Nao foi possivel analisar o manifesto DASH (${err.message}).`);
      safeIo.log('O download tentara usar a URL fornecida diretamente.');
    }
  } else if (sourceType === 'direct') {
    safeIo.log('\nArquivo direto detectado. O download seguira sem analise de playlist.');
  }

  return { url, adapter, sourceType, targetUrl, info, headers, useCurlFlag };
}
