/** Análise de playlists HLS e manifestos DASH. */

import { fetchPlaylist } from '../../hls.js';
import { print403, chooseVariant } from '../../cli/ui.js';
import { formatKbps, maskUrl } from '../../utils.js';

/**
 * Analisa a playlist HLS e escolhe a variante. Pode ativar o modo
 * curl-impersonate (retorna o flag atualizado).
 */
export async function analyzeHlsSource({ url, headers, answerFn, safeIo, useCurlFlag, legacyFlow }) {
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

  let targetUrl = url;
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

  return { info: infoPlaylist, targetUrl, useCurlFlag };
}

/** Analisa o manifesto DASH apenas para log. */
export async function analyzeDashSource({ url, headers, adapter, safeIo }) {
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
}
