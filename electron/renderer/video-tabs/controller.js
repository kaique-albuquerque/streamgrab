/** Composicao do controller de abas de video. */

import { refreshResolvedOutput } from '../shared.js';
import { createDownloadHandlers } from '../video-tab-download.js';
import { createTabAnalysis } from '../video-tab-analysis.js';
import { createTabLifecycle } from './tab-lifecycle.js';
import { createTabEvents } from './tab-events.js';

export function createVideoTabsController({ appState, dom, onQueueRefresh, onHistoryRefresh, previewPlayer }) {
  const { enqueueForTab, cancelTabDownload, handleQueueEvent, jobProgress } = createDownloadHandlers({
    appState,
    onQueueRefresh,
    onHistoryRefresh,
  });
  const { analyzeTab } = createTabAnalysis({ appState });

  const { wireTabEvents } = createTabEvents({
    appState,
    enqueueForTab,
    cancelTabDownload,
    analyzeTab,
    previewPlayer,
  });
  const { addTab, activateTab } = createTabLifecycle({ appState, dom, wireTabEvents });

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
