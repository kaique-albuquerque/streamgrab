/**
 * SPEC-03: download em lote (batch:enqueue).
 */

import { BrowserWindow, ipcMain } from 'electron';
import { validateBatchEnqueuePayload } from '../../security.js';
import { addRevealRoot, getServices } from '../state.js';
import { analyzePlaylist } from '../playlist-handlers.js';
import { enqueueDownload } from './enqueue.js';

function broadcastBatchProgress(data) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('batch:progress', data);
  }
}

export function registerBatchEnqueueHandler() {
  ipcMain.handle('batch:enqueue', async (_event, rawPayload) => {
    const services = getServices();
    if (!services) {
      return { results: [], ok: 0, failed: 0, error: 'Serviços não inicializados.' };
    }
    const payload = validateBatchEnqueuePayload(rawPayload);
    if (!payload) {
      return { results: [], ok: 0, failed: 0, error: 'Payload de lote inválido ou diretório inseguro.' };
    }

    if (payload.outputDir) addRevealRoot(payload.outputDir);

    const { processBatch } = await import('../../../src/batch.js');

    return processBatch({
      urls: payload.urls,
      outputDir: payload.outputDir,
      options: {
        turbo: payload.turbo,
        allAudio: payload.allAudio,
        subtitleLanguages: payload.subtitleLanguages,
        embedSubs: payload.embedSubs,
      },
      analyze: (url) => analyzePlaylist({ url, headers: {}, auth: {} }),
      enqueue: (item) =>
        enqueueDownload({
          url: item.url,
          filename: item.filename,
          title: item.title,
          outputDir: item.outputDir,
          turbo: item.options?.turbo === true,
          allAudio: item.options?.allAudio === true,
          subtitleLanguages: item.options?.subtitleLanguages || [],
          embedSubs: item.options?.embedSubs === true,
        }),
      onProgress: (data) => broadcastBatchProgress(data),
    });
  });
}
