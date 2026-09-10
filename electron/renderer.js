import { createAppState, getRendererDom } from './renderer/app-state.js';
import { createPanelsController } from './renderer/panels.js';
import { createVideoTabsController } from './renderer/video-tabs.js';
import { createClipboardToast } from './renderer/clipboard-toast.js';
import { createTutorialController } from './renderer/tutorial.js';
import { createBatchDialog } from './renderer/batch-dialog.js';
import { createPreviewPlayer } from './renderer/preview-player.js';

const appState = createAppState();
const dom = getRendererDom();

let panelsController = null;
let tutorialController = null;

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

// Clipboard watcher — detecta URLs de mídia na clipboard
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

dom.newTabBtn.addEventListener('click', () => tabsController.addTab());
tabsController.addTab();
panelsController.initializePanels();

// Tutorial interativo — verifica se é primeira execução
tutorialController = createTutorialController({
  onFinish: () => {
    window.api.settingsUpdate({ tutorialCompleted: true }).catch(() => {});
  },
  onSkip: () => {
    // Não marca como completo, pode rodar de novo
  },
});
appState.tutorial = tutorialController;

// Inicia o tutorial na primeira execução
window.api.settingsGet().then((settings) => {
  if (!settings?.tutorialCompleted) {
    // Pequeno delay para a UI terminar de renderizar
    setTimeout(() => tutorialController.start(), 500);
  }
});

// Botão de ajuda flutuante (FAB)
const helpFab = document.createElement('button');
helpFab.className = 'help-fab';
helpFab.textContent = '?';
helpFab.title = 'Ajuda';
helpFab.setAttribute('aria-label', 'Abrir menu de ajuda');

helpFab.addEventListener('click', () => {
  if (tutorialController.isRunning()) return;

  const menu = document.createElement('div');
  menu.className = 'help-menu';
  menu.innerHTML = `
    <button class="help-menu-item" data-action="tour">📖 Tour completo</button>
    <button class="help-menu-item" data-action="urlhelp">❓ Como obter URL</button>
    <button class="help-menu-item" data-action="tips">💡 Dicas rápidas</button>
    <button class="help-menu-item" data-action="readme" target="_blank">📄 Ver README</button>
  `;

  // Posiciona o menu acima do FAB
  document.body.appendChild(menu);

  const closeMenu = () => { if (menu.parentNode) menu.parentNode.removeChild(menu); };

  menu.querySelector('[data-action="tour"]').addEventListener('click', () => {
    closeMenu();
    tutorialController.start();
  });
  menu.querySelector('[data-action="urlhelp"]').addEventListener('click', () => {
    closeMenu();
    tutorialController.showUrlHelp();
  });
  menu.querySelector('[data-action="tips"]').addEventListener('click', () => {
    closeMenu();
    tutorialController.showQuickTips();
  });
  menu.querySelector('[data-action="readme"]').addEventListener('click', () => {
    closeMenu();
    window.api.openExternal('https://github.com/kaique-albuquerque/streamgrab#readme').catch(() => {});
  });

  // Fecha ao clicar fora
  const outsideClick = (e) => {
    if (!menu.contains(e.target) && e.target !== helpFab) {
      closeMenu();
      document.removeEventListener('click', outsideClick);
    }
  };
  setTimeout(() => document.addEventListener('click', outsideClick), 0);
});

document.body.appendChild(helpFab);

// SPEC-03: Download em lote
const batchDialog = createBatchDialog({
  api: window.api,
  getDefaultOutputDir: () => appState.defaultOutputDir || '',
  onEnqueued: () => {
    panelsController?.refreshQueuePanel();
  },
});

const batchBtn = document.getElementById('batchBtn');
if (batchBtn) {
  batchBtn.addEventListener('click', () => batchDialog.open());
}
