/**
 * Handlers IPC de download, fila e lote — StreamGrabCore + DownloadQueue.
 */

import path from 'node:path';
import { BrowserWindow, ipcMain } from 'electron';
import { loadConfig, applyProviderHeaders } from '../../src/cli/config.js';
import { friendlyReport } from '../../src/core/errors.js';
import {
  validateDownloadPayload,
  validateQueueEnqueuePayload,
  validateJobIdPayload,
  isValidJobId,
  isValidTaskId,
  isSafeHttpUrl,
} from '../security.js';
import { PROJECT_ROOT, getServices, addRevealRoot, taskToJob } from './state.js';
import { analyzePlaylist } from './playlist-handlers.js';

function enqueueDownload({ url, filename, outputDir, selectedUrl, title, turbo, cookiesFile, cookiesFromBrowser, taskId, audioLanguage, allAudio, subtitleLanguages, embedSubs }) {
  const services = getServices();
  if (!services) {
    const err = new Error('Serviços ainda não inicializados.');
    err.code = 'NOT_READY';
    throw err;
  }
  if (outputDir) addRevealRoot(outputDir);

  const config = loadConfig(PROJECT_ROOT, { log: () => {} });
  const downloadHeaders = applyProviderHeaders({
    url,
    headers: config.headers,
    argv: ['--hotmart'],
  });

  const job = services.queue.enqueue(url, {
    title: title || filename || '',
    meta: {
      destination: outputDir || '',
      filename: filename || '',
      selectedUrl: selectedUrl || '',
      sourceUrl: url,
      taskId: taskId || '',
      turbo: Boolean(turbo),
      turboChunks: Number(services.settings.get('turboChunks')) || 8,
      headers: downloadHeaders,
      auth: {
        cookiesFile: cookiesFile || config.cookiesFile || '',
        cookiesFromBrowser: cookiesFromBrowser || config.cookiesFromBrowser || '',
      },
      audioLanguage: audioLanguage || '',
      allAudio: Boolean(allAudio),
      subtitleLanguages: Array.isArray(subtitleLanguages) ? subtitleLanguages : [],
      embedSubs: Boolean(embedSubs),
    },
  });
  if (taskId) taskToJob.set(taskId, job.id);
  services.queue.save();
  return job;
}

export { enqueueDownload };

export function registerQueueHandlers() {
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

  ipcMain.handle('queue:list', async () => {
    const services = getServices();
    if (!services) return { jobs: [], maxConcurrent: 3, paused: false };
    const jobs = services.queue.all().map((j) => ({ ...j, meta: { ...j.meta } }));
    return { jobs, maxConcurrent: services.queue.maxConcurrent, paused: services.queue.paused };
  });

  ipcMain.handle('queue:setPaused', async (_e, value) => {
    const services = getServices();
    if (!services) return { ok: false, error: 'Serviços não inicializados' };
    services.queue.setPaused(Boolean(value));
    await services.queue.save();
    return { ok: true, paused: services.queue.paused };
  });

  ipcMain.handle('queue:pause', async (_event, rawPayload) => {
    const payload = validateJobIdPayload(rawPayload);
    const services = getServices();
    if (!payload || !services) return false;
    try {
      services.queue.pause(payload.jobId);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('queue:resume', async (_event, rawPayload) => {
    const payload = validateJobIdPayload(rawPayload);
    const services = getServices();
    if (!payload || !services) return false;
    try {
      services.queue.resume(payload.jobId);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('queue:cancel', async (_event, rawPayload) => {
    const payload = validateJobIdPayload(rawPayload);
    const services = getServices();
    if (!payload || !services) return false;
    try {
      services.queue.cancel(payload.jobId);
      services.queue.save();
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('queue:retry', async (_event, rawPayload) => {
    const payload = validateJobIdPayload(rawPayload);
    const services = getServices();
    if (!payload || !services) return false;
    try {
      const job = services.queue.retry(payload.jobId);
      services.queue.save();
      return { ok: true, jobId: job.id };
    } catch {
      return false;
    }
  });

  ipcMain.handle('queue:remove', async (_event, rawPayload) => {
    const payload = validateJobIdPayload(rawPayload);
    const services = getServices();
    if (!payload || !services) return false;
    try {
      services.queue.remove(payload.jobId);
      services.queue.save();
      return true;
    } catch {
      return false;
    }
  });

  // Compatibilidade com o fluxo antigo de cancelamento por taskId (abas).
  ipcMain.handle('download:cancel', async (_event, rawPayload) => {
    const services = getServices();
    if (!services) return false;
    const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
    let jobId = typeof payload.jobId === 'string' && isValidJobId(payload.jobId) ? payload.jobId : '';
    if (!jobId) {
      const taskId = typeof payload.taskId === 'string' && isValidTaskId(payload.taskId) ? payload.taskId : '';
      jobId = taskToJob.get(taskId) || '';
    }
    if (!jobId) return false;
    try {
      services.queue.cancel(jobId);
      services.queue.save();
      return true;
    } catch {
      return false;
    }
  });

  // SPEC-03: download em lote
  ipcMain.handle('batch:enqueue', async (_event, rawPayload) => {
    const services = getServices();
    if (!services) {
      return { results: [], ok: 0, failed: 0, error: 'Serviços não inicializados.' };
    }
    const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
    const rawUrls = Array.isArray(payload.urls) ? payload.urls : [];

    const urls = [];
    for (const u of rawUrls) {
      const value = typeof u === 'string' ? u.trim() : '';
      if (value && isSafeHttpUrl(value)) urls.push(value);
    }

    if (urls.length === 0) {
      return { results: [], ok: 0, failed: 0, error: 'Nenhuma URL válida informada.' };
    }

    const outputDir = typeof payload.outputDir === 'string' ? payload.outputDir : '';
    if (outputDir) addRevealRoot(outputDir);

    const { processBatch } = await import('../../src/batch.js');

    const send = (data) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('batch:progress', data);
      }
    };

    const results = await processBatch({
      urls,
      outputDir,
      options: {
        turbo: payload.turbo === true,
        allAudio: payload.allAudio === true,
        subtitleLanguages: Array.isArray(payload.subtitleLanguages) ? payload.subtitleLanguages : [],
        embedSubs: payload.embedSubs === true,
      },
      analyze: (url) => analyzePlaylist({ url, headers: {}, auth: {} }),
      enqueue: (item) => {
        const job = enqueueDownload({
          url: item.url,
          filename: item.filename,
          title: item.title,
          outputDir: item.outputDir,
          turbo: item.options?.turbo === true,
          allAudio: item.options?.allAudio === true,
          subtitleLanguages: item.options?.subtitleLanguages || [],
          embedSubs: item.options?.embedSubs === true,
        });
        return job;
      },
      onProgress: (data) => send(data),
    });

    return results;
  });
}
