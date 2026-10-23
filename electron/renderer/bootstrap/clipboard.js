/** Clipboard watcher — detecta URLs de mídia na clipboard e oferece preencher/analisar. */

import { createClipboardToast } from '../clipboard-toast.js';

export function setupClipboardWatcher({ appState }) {
  const clipboardToast = createClipboardToast();
  window.api.onClipboardDetected(({ url, sourceType }) => {
    const activeTab = appState.tabs.get(appState.activeTabId);
    if (!activeTab) return;

    clipboardToast.show({
      url,
      sourceType,
      onAnalyze: (detectedUrl) => {
        activeTab.fields.url.value = detectedUrl;
        activeTab.fields.url.dispatchEvent(new Event('input', { bubbles: true }));
        // Dispara análise automaticamente
        activeTab.fields.analyzeBtn.click();
      },
      onFillOnly: (detectedUrl) => {
        activeTab.fields.url.value = detectedUrl;
        activeTab.fields.url.dispatchEvent(new Event('input', { bubbles: true }));
      },
    });
  });
  return clipboardToast;
}
