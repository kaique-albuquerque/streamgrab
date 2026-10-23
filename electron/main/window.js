/**
 * Criação e endurecimento da BrowserWindow principal.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BrowserWindow, shell } from 'electron';

import { isSafeHttpUrl } from '../security.js';
import { PROJECT_ROOT } from '../ipc/state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ELECTRON_DIR = path.join(__dirname, '..');

/** Cria a janela principal com as políticas de navegação seguras. */
export function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#0a0f14',
    title: 'StreamGrab',
    icon: path.join(PROJECT_ROOT, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(ELECTRON_DIR, 'preload.cjs'),
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

  win.loadFile(path.join(ELECTRON_DIR, 'index.html'));
  return win;
}
