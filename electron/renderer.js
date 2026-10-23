/**
 * Entrypoint do renderer: carrega os templates e orquestra os controllers.
 * Os blocos de inicialização vivem em ./renderer/bootstrap/.
 */

import { createAppState, getRendererDom } from './renderer/app-state.js';
import { createPanelsController } from './renderer/panels.js';
import { createVideoTabsController } from './renderer/video-tabs.js';
import { createPreviewPlayer } from './renderer/preview-player.js';
import { loadTemplates } from './renderer/bootstrap/templates.js';
import { setupClipboardWatcher } from './renderer/bootstrap/clipboard.js';
import { setupTranscribeEvents } from './renderer/bootstrap/transcribe-events.js';
import { setupTutorial } from './renderer/bootstrap/tutorial.js';
import { setupHelpFab } from './renderer/bootstrap/help-fab.js';
import { setupBatchDialog } from './renderer/bootstrap/batch.js';

const appState = createAppState();
const dom = getRendererDom();

let panelsController = null;
const getPanels = () => panelsController;

// SPEC-06: player de preview (compartilhado entre abas)
const previewPlayer = createPreviewPlayer({ api: window.api });

const tabsController = createVideoTabsController({
  appState,
  dom,
  onQueueRefresh: () => panelsController?.refreshQueuePanel(),
  onHistoryRefresh: () => panelsController?.refreshHistoryPanel(),
  previewPlayer,
});

panelsController = createPanelsController({
  dom,
  tabsController,
});

panelsController.initializeTheme();

window.api.resolvePaths().then(({ defaultDownloads }) => {
  tabsController.setDefaultOutputDir(defaultDownloads || '');
});

window.api.onQueueEvent(({ event, payload }) => {
  tabsController.handleQueueEvent(event, payload);
  panelsController?.handleQueueEvent(event, payload);
});

setupTranscribeEvents(getPanels);
setupClipboardWatcher({ appState });

dom.newTabBtn.addEventListener('click', () => tabsController.addTab());

const tutorialController = setupTutorial({ appState });
setupHelpFab({ tutorialController });
setupBatchDialog({ appState, getPanels });

// Carrega templates HTML e só então inicializa o app
loadTemplates().then(() => {
  tabsController.addTab();
  panelsController.initializePanels();
}).catch(() => {
  // Fallback: inicializa mesmo sem templates (já estavam inline)
  tabsController.addTab();
  panelsController.initializePanels();
});
