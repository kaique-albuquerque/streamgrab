/** Clipboard watcher — detecta URLs de mídia na clipboard e oferece preencher/analisar. */

import { createClipboardToast } from '../clipboard-toast.js';
import { needsNewTab } from '../clipboard-target.js';

export function setupClipboardWatcher({ appState, tabsController }) {
  const clipboardToast = createClipboardToast();

  /**
   * Aba que recebe a URL: a ativa, ou uma nova quando ela já está em uso.
   * A aba é resolvida no clique (e não na detecção) para respeitar trocas
   * de aba enquanto o toast está visível.
   */
  function targetTab() {
    const activeTab = appState.tabs.get(appState.activeTabId) || null;
    if (!needsNewTab(activeTab)) return activeTab;
    // Templates ainda não carregados: não há como montar uma aba nova.
    if (!document.getElementById('tabTemplate')) return activeTab;
    tabsController?.addTab();
    return appState.tabs.get(appState.activeTabId) || null;
  }

  function fillUrl(tab, url) {
    tab.fields.url.value = url;
    tab.fields.url.dispatchEvent(new Event('input', { bubbles: true }));
  }

  window.api.onClipboardDetected(({ url, sourceType }) => {
    clipboardToast.show({
      url,
      sourceType,
      onAnalyze: (detectedUrl) => {
        const tab = targetTab();
        if (!tab) return;
        fillUrl(tab, detectedUrl);
        // Dispara análise automaticamente
        tab.fields.analyzeBtn.click();
      },
      onFillOnly: (detectedUrl) => {
        const tab = targetTab();
        if (!tab) return;
        fillUrl(tab, detectedUrl);
      },
    });
  });
  return clipboardToast;
}
