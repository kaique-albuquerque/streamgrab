/**
 * Video Tab — Workflow de análise de URL/playlist.
 *
 * Analisa a URL informada, resolve o tipo de mídia e atualiza
 * o estado da aba com qualidades, tracks e metadados.
 */

import {
  appendLog,
  markAllPreviousAsDone,
  refreshResolvedOutput,
  resetProgress,
  setActiveStep,
  setStatus,
} from './shared.js';
import { renderMediaInfo, renderQualities, renderAudioSubtitleTracks, syncPreviewButton } from './video-tab-renderers.js';

export function createTabAnalysis({ appState }) {
  async function analyzeTab(state) {
    if (state.busy) return;

    const url = state.fields.url.value.trim();
    if (!url) {
      setStatus(state, 'Nenhuma URL informada.');
      return;
    }

    setActiveStep(state, 'url');
    markAllPreviousAsDone(state, 'url');
    resetProgress(state);
    state.fields.revealRow.hidden = true;
    setStatus(state, 'Analisando playlist...');
    state.fields.modeLabel.textContent = 'Analise de playlist em andamento';
    state.fields.log.textContent = [
      '==============================================',
      'StreamGrab - HLS / DASH / YouTube / Redes sociais',
      '==============================================',
      '',
      'Verificando FFmpeg...',
      'FFmpeg OK.',
      '',
      `URL do video/playlist: ${url}`,
      'Analisando playlist...',
    ].join('\n');

    try {
      const info = await window.api.analyzePlaylist({ url, headers: {} });
      if (info && info.ok === false) {
        const err = info.error || {};
        setStatus(state, `Erro ao analisar: ${err.message || 'falha desconhecida'}`);
        appendLog(state, `[ERRO] ${err.message || 'falha desconhecida'}`);
        if (err.suggestedAction) appendLog(state, `Acao sugerida: ${err.suggestedAction}`);
        if (err.detail) appendLog(state, `Detalhes: ${err.detail}`);
        state.fields.modeLabel.textContent = 'Falha na analise';
        return;
      }

      state.sourceUrl = info.workingUrl || url;
      state.analysisBaseUrl = info.baseUrl || info.media?.baseUrl || url;
      state.media = info.media || null;
      state.audioTracks = info.media?.audioTracks || info.audioTracks || [];
      state.subtitleTracks = info.media?.subtitleTracks || info.subtitleTracks || [];
      renderMediaInfo(state);
      renderAudioSubtitleTracks(state);

      if (info.kind === 'master' || info.kind === 'youtube' || info.kind === 'ytdlp') {
        state.qualities = info.variants;
        state.selectedVariantUri = info.variants[0]?.uri || '';
        state.selectedQuality = state.selectedVariantUri
          ? new URL(state.selectedVariantUri, state.analysisBaseUrl).toString()
          : null;
        renderQualities(state);
        setActiveStep(state, 'variant');
        markAllPreviousAsDone(state, 'variant');
        const title = info.title ? ` para "${info.title}"` : '';
        setStatus(state, `Formatos encontrados${title}. Se nada for escolhido, a melhor disponivel sera usada.`);
        appendLog(state, `Formatos encontrados: ${info.variants.length}`);
      } else if (info.kind === 'dash') {
        state.qualities = [];
        state.selectedVariantUri = '';
        state.selectedQuality = url;
        const best = info.videoRepresentations?.[0];
        renderQualities(
          state,
          best
            ? `Manifesto DASH detectado. Melhor representacao encontrada: ${best.resolution || 'sem resolucao'}.`
            : 'Manifesto DASH detectado. O FFmpeg resolvera as representacoes automaticamente.'
        );
        setActiveStep(state, 'file');
        markAllPreviousAsDone(state, 'file');
        setStatus(state, 'Manifesto DASH pronto para download.');
        appendLog(state, `Representacoes DASH: ${info.videoRepresentations?.length || 0}`);
      } else {
        state.qualities = [];
        state.selectedVariantUri = '';
        state.selectedQuality = url;
        state.duration = info.totalDuration || 0;
        renderQualities(
          state,
          info.kind === 'direct'
            ? 'Arquivo direto detectado. O CLI seguira direto para o download.'
            : 'Playlist unica detectada. O CLI seguiria direto para o download.'
        );
        setActiveStep(state, 'file');
        markAllPreviousAsDone(state, 'file');
        setStatus(state, info.kind === 'direct' ? 'Arquivo direto pronto para download.' : 'Playlist pronta para download.');
        appendLog(state, info.kind === 'direct' ? 'Arquivo direto detectado.' : 'Playlist unica detectada.');
      }

      refreshResolvedOutput(state, appState.defaultOutputDir);
      // SPEC-06: habilita o preview apenas para fontes suportadas
      syncPreviewButton(state);
    } catch (err) {
      setStatus(state, `Erro ao analisar: ${err.message}`);
      appendLog(state, `[ERRO] ${err.message}`);
      syncPreviewButton(state);
    }
  }

  return { analyzeTab };
}
