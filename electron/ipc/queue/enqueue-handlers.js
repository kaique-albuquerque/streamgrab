/**
 * Canais de início de download, enfileiramento, listagem e pausa global.
 */

import { ipcMain } from 'electron';
import { friendlyReport } from '../../../src/core/errors.js';
import { validateDownloadPayload, validateQueueEnqueuePayload } from '../../security.js';
import { getServices } from '../state.js';
import { enqueueDownload } from './enqueue.js';

export function registerDownloadStartHandler() {
  ipcMain.handle('download:start', async (_event, rawPayload) => {
    const payload = validateDownloadPayload(rawPayload);
    if (!payload) {
      return {
        code: 1,
        ok: false,
        error: {
          message: 'Payload de download inválido.',
          suggestedAction: 'Feche e reabra a aba ou reinicie o aplicativo e tente novamente.',
        },
      };
    }
    try {
      const job = enqueueDownload(payload);
      return { ok: true, jobId: job.id };
    } catch (err) {
      return { code: 1, ok: false, error: friendlyReport(err) };
    }
  });
}

export function registerQueueEnqueueHandler() {
  ipcMain.handle('queue:enqueue', async (_event, rawPayload) => {
    const payload = validateQueueEnqueuePayload(rawPayload);
    if (!payload) {
      return { ok: false, error: { message: 'Payload de fila inválido.', suggestedAction: 'Verifique a URL e tente novamente.' } };
    }
    try {
      const job = enqueueDownload(payload);
      return { ok: true, jobId: job.id };
    } catch (err) {
      return { ok: false, error: friendlyReport(err) };
    }
  });
}

export function registerQueueListHandler() {
  ipcMain.handle('queue:list', async () => {
    const services = getServices();
    if (!services) return { jobs: [], maxConcurrent: 3, paused: false };
    const jobs = services.queue.all().map((j) => ({ ...j, meta: { ...j.meta } }));
    return { jobs, maxConcurrent: services.queue.maxConcurrent, paused: services.queue.paused };
  });
}

export function registerQueueSetPausedHandler() {
  ipcMain.handle('queue:setPaused', async (_e, value) => {
    const services = getServices();
    if (!services) return { ok: false, error: 'Serviços não inicializados' };
    services.queue.setPaused(Boolean(value));
    await services.queue.save();
    return { ok: true, paused: services.queue.paused };
  });
}
