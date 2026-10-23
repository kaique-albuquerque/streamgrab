/**
 * main.js — Orquestrador do processo principal do Electron.
 *
 * Responsabilidades:
 *  1. Configurar environment (production paths)
 *  2. Inicializar serviços, handlers IPC e a janela (./bootstrap.js)
 *  3. Gerenciar ciclo de vida da aplicação (ready, quit, activate)
 *
 * Handlers IPC organizados por domínio em electron/ipc/.
 */

import { app } from 'electron';

import { configurePackagedResources } from './env.js';
import { initializeApp } from './bootstrap.js';

configurePackagedResources();

app.whenReady().then(initializeApp);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
