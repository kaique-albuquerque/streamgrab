/**
 * Handlers IPC de histórico e configurações — P11.
 */

import path from 'node:path';
import { ipcMain, dialog } from 'electron';
import { loadConfig } from '../../src/cli/config.js';
import { friendlyReport } from '../../src/core/errors.js';
import {
  validateHistoryIdPayload,
  validateSettingsPayload,
} from '../security.js';
import { PROJECT_ROOT, getServices, addRevealRoot } from './state.js';
import { enqueueDownload } from './queue-handlers.js';

export function registerHistoryHandlers() {
  ipcMain.handle('history:list', async () => {
    const services = getServices();
    if (!services) return [];
    return services.history.list();
  });

  ipcMain.handle('history:remove', async (_event, rawPayload) => {
    const payload = validateHistoryIdPayload(rawPayload);
    const services = getServices();
    if (!payload || !services) return false;
    services.history.remove(payload.id);
    return true;
  });

  ipcMain.handle('history:clear', async () => {
    const services = getServices();
    if (!services) return false;
    services.history.clear();
    return true;
  });

  ipcMain.handle('history:export', async (_event, rawPayload) => {
    const services = getServices();
    if (!services) return { ok: false, error: 'Serviços não inicializados.' };

    const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
    const format = payload.format === 'csv' ? 'csv' : 'json';

    let entries;
    if (Array.isArray(payload.entries)) {
      entries = payload.entries
        .filter((e) => e && typeof e === 'object')
        .map((e) => ({
          id: String(e.id || ''),
          title: String(e.title || ''),
          url: String(e.url || ''),
          provider: String(e.provider || ''),
          format: String(e.format || ''),
          destination: String(e.destination || ''),
          status: String(e.status || ''),
          size: Number(e.size) || 0,
          durationMs: Number(e.durationMs) || 0,
          date: String(e.date || ''),
        }));
    } else {
      entries = services.history.list();
    }

    let destPath = typeof payload.filePath === 'string' ? payload.filePath : '';
    if (!destPath) {
      const { suggestExportFilename } = await import('../../src/core/history-export.js');
      const { app } = await import('electron');
      const result = await dialog.showSaveDialog({
        title: 'Exportar histórico',
        defaultPath: suggestExportFilename(format),
        filters: format === 'csv'
          ? [{ name: 'CSV (Planilha)', extensions: ['csv'] }]
          : [{ name: 'JSON', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) return { ok: false, canceled: true };
      destPath = result.filePath;
      addRevealRoot(path.dirname(destPath));
    } else if (!path.isAbsolute(destPath)) {
      return { ok: false, error: 'Caminho de destino inválido.' };
    }

    const { exportHistoryToFile } = await import('../../src/core/history-export.js');
    return exportHistoryToFile({ entries, format, filePath: destPath });
  });

  ipcMain.handle('history:redownload', async (_event, rawPayload) => {
    const payload = validateHistoryIdPayload(rawPayload);
    const services = getServices();
    if (!payload || !services) return false;
    const entry = services.history.get(payload.id);
    if (!entry) return { ok: false, error: 'Entrada não encontrada no histórico.' };
    try {
      const destination = typeof entry.destination === 'string' && entry.destination ? entry.destination : '';
      const dir = destination ? path.dirname(destination) : '';
      const base = destination ? path.basename(destination, path.extname(destination)) : '';
      const job = enqueueDownload({
        url: entry.url,
        filename: base,
        outputDir: dir,
        title: entry.title || '',
      });
      return { ok: true, jobId: job.id };
    } catch (err) {
      return { ok: false, error: friendlyReport(err) };
    }
  });
}

export function registerSettingsHandlers() {
  ipcMain.handle('settings:get', async () => {
    const services = getServices();
    if (!services) return {};
    return services.settings.all();
  });

  ipcMain.handle('settings:update', async (_event, rawPayload) => {
    const services = getServices();
    if (!services) return null;
    const clean = validateSettingsPayload(rawPayload);
    if (!clean) return null;
    return { ok: true, settings: services.applySettings(clean) };
  });

  ipcMain.handle('settings:reset', async () => {
    const services = getServices();
    if (!services) return null;
    const updated = services.settings.reset();
    services.queue.setMaxConcurrent(updated.maxConcurrentDownloads);
    services.queue.save();
    return updated;
  });
}
