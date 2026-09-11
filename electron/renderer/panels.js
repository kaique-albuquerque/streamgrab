/**
 * panels.js — Orquestrador de painéis da UI.
 *
 * Coordena as views (videos/queue/history/settings) e delega a renderização
 * para módulos dedicados:
 *  - panel-queue.js      → fila de downloads
 *  - panel-history.js    → histórico e filtros
 *  - panel-settings.js   → configurações
 *  - panel-constants.js  → constantes compartilhadas
 */

import { initializeTheme } from './shared.js';
import { VIEWS } from './panel-constants.js';
import { createQueuePanel } from './panel-queue.js';
import { createHistoryPanel } from './panel-history.js';
import { createSettingsPanel } from './panel-settings.js';

export function createPanelsController({ dom, tabsController }) {
  const queuePanel = createQueuePanel({ tabsController });
  const historyPanel = createHistoryPanel({
    onRefreshBoth: () => {
      queuePanel.refreshQueuePanel();
      historyPanel.refreshHistoryPanel();
    },
  });
  const settingsPanel = createSettingsPanel({
    dom,
    onRefreshQueue: () => queuePanel.refreshQueuePanel(),
  });

  function switchView(name) {
    if (!VIEWS.includes(name)) return;
    for (const viewName of VIEWS) {
      const view = document.getElementById(`view-${viewName}`);
      const btn = document.getElementById(
        { videos: 'viewVideosBtn', queue: 'viewQueueBtn', history: 'viewHistoryBtn', settings: 'viewSettingsBtn' }[viewName]
      );
      if (view) view.hidden = viewName !== name;
      if (btn) btn.classList.toggle('active', viewName === name);
    }
    if (name === 'queue') queuePanel.refreshQueuePanel();
    if (name === 'history') historyPanel.refreshHistoryPanel();
    if (name === 'settings') settingsPanel.renderSettingsPanel();
  }

  function initializePanels() {
    const wire = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };

    wire('viewVideosBtn', () => switchView('videos'));
    wire('viewQueueBtn', () => switchView('queue'));
    wire('viewHistoryBtn', () => switchView('history'));
    wire('viewSettingsBtn', () => switchView('settings'));

    wire('queueRefreshBtn', () => queuePanel.refreshQueuePanel());
    wire('queueTogglePauseBtn', async () => {
      const btn = document.getElementById('queueTogglePauseBtn');
      const shouldPause = btn?.textContent.trim() === 'Pausar fila';
      await window.api.queueSetPaused(shouldPause);
      queuePanel.refreshQueuePanel();
    });

    wire('historyRefreshBtn', () => historyPanel.refreshHistoryPanel());
    wire('historyClearBtn', async () => {
      await window.api.historyClear();
      historyPanel.refreshHistoryPanel();
    });

    wire('settingsSaveBtn', () => settingsPanel.saveSettings());
    wire('settingsResetBtn', () => settingsPanel.resetSettings());
    wire('settingsPickDirBtn', () => settingsPanel.pickDir());

    queuePanel.refreshQueuePanel();
    historyPanel.refreshHistoryPanel();
    settingsPanel.renderSettingsPanel();
  }

  return {
    initializeTheme() {
      initializeTheme(dom.themeToggle, dom.themeLabel);
    },
    initializePanels,
    refreshQueuePanel: () => queuePanel.refreshQueuePanel(),
    refreshHistoryPanel: () => historyPanel.refreshHistoryPanel(),
    handleQueueEvent: (event, payload) => queuePanel.handleQueueEvent(event, payload),
  };
}
