/**
 * Handlers IPC de download (e cancelamento) de modelos de transcrição.
 */

import { ipcMain } from 'electron';
import { friendlyReport } from '../../../src/core/errors.js';
import { checkDiskSpace } from '../../../src/core/disk.js';
import {
  abortModelDownload,
  beginModelDownload,
  endModelDownload,
  getModelDownloadId,
  isCurrentDownloadAborted,
  isModelDownloading,
} from './model-download-state.js';
import {
  MODEL_MANAGER_MODULE,
  bindModelsDir,
  broadcast,
  engineModelsDir,
  invalidPayloadResponse,
  readModelPayload,
  resolveModelsDir,
} from './shared.js';

/** `transcribe:model-download` — baixa um modelo (com progresso/retomada). */
export function registerModelDownloadHandler() {
  ipcMain.handle('transcribe:model-download', async (_event, rawPayload) => {
    const { payload, response } = readModelPayload(rawPayload);
    if (!payload) return response;

    if (isModelDownloading()) {
      return invalidPayloadResponse(
        `Download do modelo "${getModelDownloadId()}" já em andamento.`,
        'Aguarde o término ou cancele o download atual.',
      );
    }

    try {
      const { app } = await import('electron');
      await bindModelsDir(app);
      const { downloadModel, getModelStatus, getModelStatusFor, MODEL_CATALOG } = await import(MODEL_MANAGER_MODULE);
      const modelsDir = resolveModelsDir(app);
      const info = MODEL_CATALOG[payload.model];

      // Já existe uma instalação do whisper.cpp com este modelo? Não baixa 465 MB de novo.
      const anywhere = getModelStatusFor(payload.model, await engineModelsDir());
      if (anywhere.installed && anywhere.externalDir) {
        return { ok: true, modelsDir, alreadyInstalled: true, ...anywhere };
      }

      // Modelos grandes: só bloqueia se realmente não houver espaço.
      const current = getModelStatus(modelsDir, payload.model);
      if (!current.installed) {
        const missingBytes = Math.max(0, (info?.expectedSize || 0) - current.partialSize);
        await checkDiskSpace({ dir: modelsDir, requiredBytes: missingBytes });
      }

      const abort = new AbortController();
      const downloadPromise = downloadModel({
        modelsDir,
        model: payload.model,
        signal: abort.signal,
        onProgress: (progress) => broadcast('transcribe:model-progress', progress),
      });
      beginModelDownload(payload.model, downloadPromise, abort);

      const status = await downloadPromise;
      return { ok: true, modelsDir, ...status };
    } catch (err) {
      const cancelled = err?.cancelled === true || isCurrentDownloadAborted();
      const report = friendlyReport(err);
      return {
        ok: false,
        cancelled,
        model: payload.model,
        error: {
          message: report.message,
          suggestedAction: cancelled
            ? 'Download cancelado. Você pode retomá-lo quando quiser.'
            : report.suggestedAction || 'Verifique sua conexão e tente novamente — o progresso é retomado.',
        },
      };
    } finally {
      endModelDownload();
    }
  });
}

/** `transcribe:model-cancel` — cancela download em andamento. */
export function registerModelCancelHandler() {
  ipcMain.handle('transcribe:model-cancel', async () => {
    if (!abortModelDownload()) {
      return invalidPayloadResponse('Nenhum download de modelo em andamento.', 'Atualize o status dos modelos.');
    }
    return { ok: true };
  });
}
