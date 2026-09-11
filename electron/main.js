/**
 * main.js — Orquestrador do processo principal do Electron.
 *
 * Responsabilidades:
 *  1. Configurar environment (production paths)
 *  2. Criar BrowserWindow e configurar segurança
 *  3. Inicializar serviços (Core + Queue + Settings + History)
 *  4. Registrar handlers IPC (delegados para módulos dedicados)
 *  5. Gerenciar ciclo de vida da aplicação (ready, quit, activate)
 *
 * Handlers IPC organizados por domínio:
 *  - electron/ipc/state.js             → estado compartilhado
 *  - electron/ipc/app-handlers.js      → diretório, disco, arquivos externos
 *  - electron/ipc/playlist-handlers.js → análise de fonte/mídia
 *  - electron/ipc/queue-handlers.js    → download, fila, lote
 *  - electron/ipc/preview-handlers.js  → preview de mídia (SPEC-06)
 *  - electron/ipc/history-handlers.js  → histórico e configurações
 */

import { app, BrowserWindow, shell, clipboard } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RESOURCES_PATH_ENV } from '../src/core/binaries.js';
import { isSafeHttpUrl } from './security.js';
import { createElectronServices } from './services.js';
import { createClipboardWatcher } from './clipboard-watcher.js';
import { createNotifier } from './notifications.js';
import { setServices, PROJECT_ROOT } from './ipc/state.js';

// Handlers IPC por domínio
import { registerAppHandlers } from './ipc/app-handlers.js';
import { registerPlaylistHandlers } from './ipc/playlist-handlers.js';
import { registerQueueHandlers } from './ipc/queue-handlers.js';
import { registerPreviewHandlers } from './ipc/preview-handlers.js';
import { registerHistoryHandlers, registerSettingsHandlers } from './ipc/history-handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// P10 (seção 7): em produção, os binários ficam em extraResources.
if (app.isPackaged && process.resourcesPath) {
  process.env[RESOURCES_PATH_ENV] = process.resourcesPath;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#0a0f14',
    title: 'StreamGrab',
    icon: path.join(PROJECT_ROOT, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.removeMenu();

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeHttpUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault();
      if (isSafeHttpUrl(url)) shell.openExternal(url);
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));
  return win;
}

let clipboardWatcher = null;

app.whenReady().then(() => {
  // P11: monta os serviços com persistência real em userData
  // (settings.json, history.json, queue.json) — itens 3-5 do pedido.
  const userDataDir = app.getPath('userData');
  const broadcast = (event, payload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('queue:event', { event, payload });
    }
  };

  // P11: serviços compartilhados com persistência real.
  const services = createElectronServices({
    userDataDir,
    onEvent: (event, payload) => broadcast(event, payload),
  });
  setServices(services);

  // Eventos do engine que a fila não re-emite.
  for (const event of ['start', 'progress', 'speed', 'eta', 'pause', 'resume', 'log']) {
    services.core.on(event, (payload) => broadcast(event, payload));
  }

  app.on('before-quit', () => {
    try { services?.queue.save(); } catch { /* ignora */ }
  });

  // Registrar handlers IPC por domínio.
  clipboardWatcher = createClipboardWatcher({ clipboard });
  registerAppHandlers(clipboardWatcher);
  registerPlaylistHandlers();
  registerQueueHandlers();
  registerPreviewHandlers();
  registerHistoryHandlers();
  registerSettingsHandlers();

  const mainWin = createWindow();

  // Clipboard watcher.
  clipboardWatcher.setOnDetected(({ url, sourceType }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('clipboard:url-detected', { url, sourceType });
      }
    }
  });
  if (services.settings.get('clipboardWatch') !== false) {
    clipboardWatcher.start();
  }

  mainWin.on('blur', () => clipboardWatcher.focusLost());
  mainWin.on('focus', () => clipboardWatcher.focusGained());

  // Notificações nativas.
  const notifier = createNotifier({
    settingsGet: () => services.settings.all(),
    getWindow: () => BrowserWindow.getAllWindows()[0] || null,
    shell,
  });
  for (const event of ['complete', 'error']) {
    services.core.on(event, (payload) => notifier.onJobEvent(event, payload));
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
