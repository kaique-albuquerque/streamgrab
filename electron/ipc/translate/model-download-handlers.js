/**
 * Handlers IPC de download (e cancelamento) de modelos de tradução.
 */

import { ipcMain } from 'electron';
import { friendlyReport } from '../../../src/core/errors.js';
import {
  TRANSLATE_MODEL_MANAGER_MODULE,
  bindTranslateModelsDir,
  broadcast,
  invalidPayloadResponse,
  readTranslateModelPayload,
  resolveTranslateModelsDir,
} from './shared.js';

/** Download de modelo em andamento (um por vez). */
let downloadPromise = null;
let downloadAbort = null;
let downloadId = null;

/** `translate:model-download` — baixa um modelo (com progresso/retomada). */
export function registerModelDownloadHandler() {
  ipcMain.handle('translate:model-download', async (_event, rawPayload) => {
    const { payload, response } = readTranslateModelPayload(rawPayload);
    if (!payload) return response;

    if (downloadPromise) {
      return invalidPayloadResponse(
        `Download do modelo "${downloadId}" já em andamento.`,
        'Aguarde o término ou cancele o download atual.',
      );
    }

    try {
      const { app } = await import('electron');
      await bindTranslateModelsDir(app);
      const { downloadTranslateModel, getTranslateModelStatus } = await import(TRANSLATE_MODEL_MANAGER_MODULE);
      const modelsDir = resolveTranslateModelsDir(app);

      const abort = new AbortController();
      const promise = downloadTranslateModel({
        model: payload.model,
        signal: abort.signal,
        onProgress: (progress) => broadcast('translate:model-progress', progress),
      });
      downloadPromise = promise;
      downloadAbort = abort;
      downloadId = payload.model;

      const status = await promise;
      return { ok: true, modelsDir, ...status };
    } catch (err) {
      const cancelled = err?.cancelled === true || Boolean(downloadAbort?.signal?.aborted);
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
      downloadPromise = null;
      downloadAbort = null;
      downloadId = null;
    }
  });
}

/** `translate:model-cancel` — cancela download em andamento. */
export function registerModelCancelHandler() {
  ipcMain.handle('translate:model-cancel', async () => {
    if (!downloadPromise) {
      return invalidPayloadResponse('Nenhum download de modelo em andamento.', 'Atualize o status dos modelos.');
    }
    downloadAbort?.abort();
    return { ok: true };
  });
}

/** `translate:model-delete` — exclui os arquivos de um modelo baixado. */
export function registerModelDeleteHandler() {
  ipcMain.handle('translate:model-delete', async (_event, rawPayload) => {
    const { payload, response } = readTranslateModelPayload(rawPayload);
    if (!payload) return response;

    if (downloadId === payload.model) {
      return invalidPayloadResponse(
        `Há um download em andamento para "${payload.model}".`,
        'Cancele o download antes de excluir o modelo.',
      );
    }

    try {
      const { app } = await import('electron');
      await bindTranslateModelsDir(app);
      const { deleteModel, getTranslateModelStatus } = await import(TRANSLATE_MODEL_MANAGER_MODULE);
      const modelsDir = resolveTranslateModelsDir(app);
      const { deleteTranslateModel } = await import(TRANSLATE_MODEL_MANAGER_MODULE);
      deleteTranslateModel(modelsDir, payload.model);
      return { ok: true, model: payload.model, modelsDir, status: getTranslateModelStatus(payload.model) };
    } catch (err) {
      const report = friendlyReport(err);
      return invalidPayloadResponse(
        report.message || 'Falha ao excluir o modelo.',
        report.suggestedAction || 'Feche o aplicativo e tente novamente.',
      );
    }
  });
}