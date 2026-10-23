/**
 * Inicialização dos serviços, handlers IPC e janela principal.
 */

import { app, BrowserWindow, clipboard, shell } from 'electron';

import { createElectronServices } from '../services.js';
import { createClipboardWatcher } from '../clipboard-watcher.js';
import { createNotifier } from '../notifications.js';
import { setServices } from '../ipc/state.js';

import { configureWhisperModelDir } from './env.js';
import { broadcast, broadcastClipboardDetection } from './broadcast.js';
import { registerAllHandlers } from './ipc-registry.js';
import { createWindow } from './window.js';

/** Eventos do engine que a fila não re-emite. */
const ENGINE_EVENTS = ['start', 'progress', 'speed', 'eta', 'pause', 'resume', 'log'];

/** Executa o bootstrap completo do app (chamado em `whenReady`). */
export function initializeApp() {
  const userDataDir = app.getPath('userData');
  configureWhisperModelDir(userDataDir);

  // P11: serviços compartilhados com persistência real.
  const services = createElectronServices({ userDataDir, onEvent: broadcast });
  setServices(services);

  for (const event of ENGINE_EVENTS) {
    services.core.on(event, (payload) => broadcast(event, payload));
  }

  app.on('before-quit', () => {
    try { services?.queue.save(); } catch { /* ignora */ }
  });

  const clipboardWatcher = createClipboardWatcher({ clipboard });
  registerAllHandlers(clipboardWatcher);

  const mainWin = createWindow();

  clipboardWatcher.setOnDetected(broadcastClipboardDetection);
  if (services.settings.get('clipboardWatch') !== false) {
    clipboardWatcher.start();
  }

  mainWin.on('blur', () => clipboardWatcher.focusLost());
  mainWin.on('focus', () => clipboardWatcher.focusGained());

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
}
