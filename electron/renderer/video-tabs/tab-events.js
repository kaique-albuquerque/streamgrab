/** Handlers de eventos dos campos de cada aba de video. */

import {
  appendLog,
  markAllPreviousAsDone,
  refreshResolvedOutput,
  setActiveStep,
  setStatus,
} from '../shared.js';
import { canPreviewSource } from '../video-tab-dom.js';

export function createTabEvents({ appState, enqueueForTab, cancelTabDownload, analyzeTab, previewPlayer }) {
  function wireTabEvents(state) {
    const { fields } = state;

    fields.url.addEventListener('input', () => {
      if (fields.url.value.trim()) {
        setActiveStep(state, 'url');
        markAllPreviousAsDone(state, 'url');
      }
    });

    fields.filename.addEventListener('input', () => {
      refreshResolvedOutput(state, appState.defaultOutputDir);
      if (fields.filename.value.trim()) {
        setActiveStep(state, 'file');
        markAllPreviousAsDone(state, 'file');
      }
    });

    fields.outputDir.addEventListener('input', () => {
      refreshResolvedOutput(state, appState.defaultOutputDir);
      if (fields.outputDir.value.trim()) {
        setActiveStep(state, 'dir');
        markAllPreviousAsDone(state, 'dir');
      }
    });

    fields.pickDirBtn.addEventListener('click', async () => {
      if (state.busy) return;
      const dir = await window.api.pickOutputDir();
      if (dir) {
        fields.outputDir.value = dir;
        refreshResolvedOutput(state, appState.defaultOutputDir);
        setActiveStep(state, 'dir');
        markAllPreviousAsDone(state, 'dir');
      }
    });

    fields.analyzeBtn.addEventListener('click', async () => {
      await analyzeTab(state);
    });

    // SPEC-06: pré-visualizar o trecho antes de baixar
    fields.previewBtn?.addEventListener('click', async () => {
      if (state.busy || !state.media) return;
      const sourceType = state.media.sourceType || '';
      if (!canPreviewSource(sourceType)) {
        setStatus(state, 'Preview não disponível para este tipo de mídia.');
        return;
      }
      await previewPlayer.open({
        url: state.sourceUrl || fields.url.value.trim(),
        sourceType,
        quality: state.selectedQuality || '',
        title: state.media.title || state.fields.filename.value.trim(),
        onDownload: () => enqueueForTab(state, { lockNow: true }),
      });
    });

    fields.downloadBtn.addEventListener('click', async () => {
      if (state.busy) return;
      await enqueueForTab(state, { lockNow: true });
    });

    fields.enqueueBtn.addEventListener('click', async () => {
      if (state.busy) return;
      await enqueueForTab(state, { lockNow: false });
    });

    fields.openFileBtn.addEventListener('click', async () => {
      if (!state.outputPath) return;
      const { ok, error } = await window.api.openFile({ filePath: state.outputPath });
      if (!ok) setStatus(state, `Nao foi possivel abrir o arquivo: ${error || 'erro desconhecido'}`);
    });

    fields.showInFolderBtn.addEventListener('click', async () => {
      if (!state.outputPath) return;
      await window.api.showInFolder({ filePath: state.outputPath });
    });

    fields.cancelBtn.addEventListener('click', async () => {
      if (state.jobId) {
        await window.api.queueCancel(state.jobId);
        setStatus(state, 'Solicitando cancelamento...');
        appendLog(state, 'Solicitando cancelamento...');
        return;
      }
      await window.api.cancelDownload({ taskId: state.taskId });
      cancelTabDownload(state);
    });
  }

  return { wireTabEvents };
}
