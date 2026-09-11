import {
  appendLog,
  markAllPreviousAsDone,
  refreshResolvedOutput,
  releaseOutput,
  setActiveStep,
  setStatus,
  syncMetrics,
} from './shared.js';
import { canPreviewSource, collectTabFields, createTabState } from './video-tab-dom.js';
import { syncPreviewButton } from './video-tab-renderers.js';
import { createDownloadHandlers } from './video-tab-download.js';
import { createTabAnalysis } from './video-tab-analysis.js';

export function createVideoTabsController({ appState, dom, onQueueRefresh, onHistoryRefresh, previewPlayer }) {
  const { enqueueForTab, cancelTabDownload, handleQueueEvent, jobProgress } = createDownloadHandlers({ appState, onQueueRefresh, onHistoryRefresh });
  const { analyzeTab } = createTabAnalysis({ appState });

  function addTab({ copyFrom } = {}) {
    const id = `tab-${appState.counter++}`;
    const label = `Video ${appState.counter - 1}`;

    const tabButton = document.createElement('button');
    tabButton.className = 'tab';
    tabButton.addEventListener('click', () => activateTab(id));

    const title = document.createElement('span');
    title.textContent = label;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'tab-close';
    closeBtn.textContent = 'x';
    closeBtn.title = 'Excluir aba';
    closeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      removeTab(id);
    });

    tabButton.append(title, closeBtn);

    const panel = dom.tabTemplate.content.firstElementChild.cloneNode(true);
    const fields = collectTabFields(panel);
    fields.outputDir.value = appState.defaultOutputDir;

    if (copyFrom) {
      fields.url.value = copyFrom.fields.url.value || '';
      fields.filename.value = copyFrom.fields.filename.value || '';
      fields.outputDir.value = copyFrom.fields.outputDir.value || appState.defaultOutputDir;
      if (copyFrom.fields.turbo?.checked) fields.turbo.checked = true;
    }

    const state = createTabState({ id, tabButton, closeBtn, panel, fields });
    wireTabEvents(state);

    appState.tabs.set(id, state);
    dom.tabBar.appendChild(tabButton);
    dom.tabPanels.appendChild(panel);
    refreshResolvedOutput(state, appState.defaultOutputDir);
    syncMetrics(state);
    activateTab(id);
  }

  function activateTab(id) {
    appState.activeTabId = id;
    for (const [tabId, tab] of appState.tabs) {
      tab.tabButton.classList.toggle('active', tabId === id);
      tab.panel.classList.toggle('active', tabId === id);
    }
  }

  function removeTab(id) {
    const tab = appState.tabs.get(id);
    if (!tab) return;
    if (tab.busy || tab.jobState === 'active' || tab.jobState === 'queued') {
      setStatus(tab, 'Cancele o download antes de excluir esta aba.');
      return;
    }
    if (tab.jobId) window.api.queueCancel(tab.jobId).catch(() => {});

    releaseOutput(appState.activeOutputs, tab.outputPath, tab.taskId);
    tab.tabButton.remove();
    tab.panel.remove();
    appState.tabs.delete(id);

    if (!appState.tabs.size) {
      addTab();
      return;
    }

    if (appState.activeTabId === id) {
      activateTab(appState.tabs.keys().next().value);
    }
  }

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

  function setDefaultOutputDir(dir) {
    appState.defaultOutputDir = dir || '';
    for (const tab of appState.tabs.values()) {
      if (!tab.fields.outputDir.value) tab.fields.outputDir.value = appState.defaultOutputDir;
      refreshResolvedOutput(tab, appState.defaultOutputDir);
    }
  }

  return {
    addTab,
    activateTab,
    handleQueueEvent,
    jobProgress,
    setDefaultOutputDir,
  };
}
