/**
 * Video Tab — Enfileiramento de downloads.
 *
 * Validação de conflito, resolução de qualidade e chamada à fila.
 */

import {
  appendLog,
  formatUiError,
  lockTab,
  markAllPreviousAsDone,
  refreshResolvedOutput,
  resetProgress,
  resolveDesiredFilename,
  setActiveStep,
  setStatus,
} from './shared.js';

export async function enqueueForTab(state, { appState, onQueueRefresh, lockNow }) {
  const url = state.fields.url.value.trim();
  if (!url) {
    setStatus(state, 'Nenhuma URL informada.');
    return;
  }

  const outputDir = (state.fields.outputDir.value.trim() || appState.defaultOutputDir || '').trim();
  const filename = resolveDesiredFilename(state);
  const fullOutput = outputDir ? `${outputDir}/${filename}` : filename;
  const conflict = appState.activeOutputs.get(fullOutput);

  if (conflict && conflict !== state.taskId) {
    setStatus(state, 'Esse nome de arquivo ja esta sendo usado em outra aba.');
    return;
  }

  if (!state.selectedQuality && state.qualities.length > 0) {
    state.selectedVariantUri = state.qualities[0].uri;
    state.selectedQuality = new URL(state.selectedVariantUri, state.analysisBaseUrl || url).toString();
  }

  const chosenQuality = state.qualities.find((q) => q.uri === state.selectedVariantUri);
  const qualityChoice = state.qualities.length
    ? String(Math.max(1, (state.qualities.findIndex((q) => q.uri === state.selectedVariantUri) + 1) || 1))
    : '';

  state.outputPath = fullOutput;
  appState.activeOutputs.set(fullOutput, state.taskId);
  refreshResolvedOutput(state, appState.defaultOutputDir);

  const result = await window.api.queueEnqueue({
    url: state.sourceUrl || url,
    filename,
    outputDir,
    selectedUrl: state.selectedQuality || '',
    title: state.media?.title || chosenQuality?.resolution || 'video',
    turbo: state.fields.turbo?.checked === true,
    qualityChoice,
    taskId: state.taskId,
    audioLanguage: state.selectedAudioLanguage || '',
    allAudio: state.fields.allAudio?.checked === true,
    subtitleLanguages: state.selectedSubtitleLanguages || [],
    embedSubs: state.fields.embedSubs?.checked === true,
  });

  if (!result || !result.ok) {
    appState.activeOutputs.delete(fullOutput);
    const errorText = formatUiError(result?.error);
    setStatus(state, `Nao foi possivel enfileirar: ${errorText}`);
    appendLog(state, `ERRO ao enfileirar: ${errorText}`);
    return;
  }

  state.jobId = result.jobId;
  state.jobState = 'queued';
  if (lockNow) {
    resetProgress(state);
    lockTab(state, true);
    setActiveStep(state, 'download');
    markAllPreviousAsDone(state, 'download');
    state.fields.modeLabel.textContent = 'Na fila — aguardando vaga';
    setStatus(state, 'Download adicionado à fila. Iniciando assim que houver vaga...');
  } else {
    setStatus(state, 'Adicionado à fila — progresso em Fila / Histórico.');
  }
  appendLog(
    state,
    [
      '==============================================',
      'StreamGrab - HLS / DASH / YouTube / Redes sociais',
      '==============================================',
      '',
      `URL reconhecida: ${url}`,
      state.qualities.length
        ? `Formato escolhido: ${chosenQuality?.resolution || state.selectedQuality || 'melhor disponivel'}`
        : state.media?.sourceType === 'direct'
          ? 'Arquivo direto detectado.'
          : 'Playlist unica detectada.',
      `Salvando em: ${fullOutput}`,
      `Fila: jobId=${state.jobId}`,
    ].join('\n')
  );
  onQueueRefresh();
}
