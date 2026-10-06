/**
 * Handlers IPC de aplicação: diretório de saída, caminhos, espaço em disco,
 * abrir arquivos externos, exportar logs, clipboard.
 */

import path from 'node:path';
import { BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { isSafeHttpUrl, isSafeAbsolutePath, validateRevealPayload, validateExportLogsPayload } from '../security.js';
import { PROJECT_ROOT, getServices, addRevealRoot, getAllowedRevealRoots } from './state.js';

export function registerAppHandlers(clipboardWatcher) {
  ipcMain.handle('app:pick-output-dir', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    addRevealRoot(result.filePaths[0]);
    return result.filePaths[0];
  });

  // Seletor de mídia para transcrição (vídeo/áudio).
  ipcMain.handle('app:pick-media-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: 'Mídia',
          extensions: [
            'mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v', 'flv', 'ts', 'mts', 'wmv', 'mpg', 'mpeg', '3gp',
            'mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wma',
          ],
        },
        { name: 'Todos os arquivos', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    addRevealRoot(path.dirname(filePath));
    return filePath;
  });

  ipcMain.handle('app:resolve-paths', async () => {
    const defaultDownloads = (await import('electron')).app.getPath('downloads');
    addRevealRoot(defaultDownloads);
    return {
      projectRoot: PROJECT_ROOT,
      defaultDownloads,
    };
  });

  // SPEC-07: espaço em disco para o dashboard da fila
  ipcMain.handle('app:disk-space', async (_event, { dir } = {}) => {
    const targetDir = typeof dir === 'string' && dir && isSafeAbsolutePath(dir) ? dir : (await import('electron')).app.getPath('downloads');
    const { getDiskSpace } = await import('../../src/core/disk.js');
    const space = await getDiskSpace(targetDir);
    return space || { free: null, total: null, used: null };
  });

  ipcMain.handle('app:open-external', async (_event, { url } = {}) => {
    if (!isSafeHttpUrl(url)) return { ok: false, error: 'URL inválida.' };
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || 'Falha ao abrir o link.' };
    }
  });

  ipcMain.handle('app:open-file', async (_event, payload) => {
    const validated = validateRevealPayload(payload, [...getAllowedRevealRoots()]);
    if (!validated) return { ok: false, error: 'Caminho inválido ou fora das pastas permitidas.' };
    const result = await shell.openPath(validated.filePath);
    return result ? { ok: false, error: result } : { ok: true };
  });

  ipcMain.handle('app:show-in-folder', async (_event, payload) => {
    const validated = validateRevealPayload(payload, [...getAllowedRevealRoots()]);
    if (!validated) return { ok: false, error: 'Caminho inválido ou fora das pastas permitidas.' };
    shell.showItemInFolder(validated.filePath);
    return { ok: true };
  });

  ipcMain.handle('app:export-logs', async (_event, payload) => {
    const { app } = await import('electron');
    const userDataDir = app.getPath('userData');
    const validated = validateExportLogsPayload(payload, [...getAllowedRevealRoots(), userDataDir]);
    if (!validated) return { ok: false, error: 'Caminho de log inválido ou fora das pastas permitidas.' };
    const { exportLogs, defaultLogPath } = await import('../../src/core/log-export.js');
    const services = getServices();
    const logger = services?.core?.events ? services.core : null;
    const buffer = logger?.getBuffer?.() || [];
    const dest = validated.path || defaultLogPath(userDataDir);
    return exportLogs(buffer, dest);
  });

  ipcMain.handle('clipboard:ignore-url', async (_event, { url }) => {
    if (clipboardWatcher && typeof url === 'string') {
      clipboardWatcher.addCooldown(url);
    }
    return { ok: true };
  });
}
