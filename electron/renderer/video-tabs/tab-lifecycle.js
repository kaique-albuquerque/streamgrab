/** Ciclo de vida das abas de video: criar, ativar e remover. */

import { markAllPreviousAsDone, refreshResolvedOutput, releaseOutput, setActiveStep, setStatus, syncMetrics } from '../shared.js';
import { collectTabFields, createTabState } from '../video-tab-dom.js';

export function createTabLifecycle({ appState, dom, wireTabEvents }) {
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

  return { addTab, activateTab, removeTab };
}
