/**
 * Handlers IPC de listagem e status de modelos de tradução.
 */

import { ipcMain } from 'electron';
import { friendlyReport } from '../../../src/core/errors.js';
import {
  TRANSLATE_MODEL_MANAGER_MODULE,
  bindTranslateModelsDir,
  invalidPayloadResponse,
  readTranslateModelPayload,
  resolveTranslateModelsDir,
} from './shared.js';

/** `translate:models` — status de todos os modelos do catálogo. */
export function registerModelsHandler() {
  ipcMain.handle('translate:models', async () => {
    try {
      const { app } = await import('electron');
      await bindTranslateModelsDir(app);
      const { listTranslateModels, DEFAULT_TRANSLATE_MODEL } = await import(TRANSLATE_MODEL_MANAGER_MODULE);
      return {
        ok: true,
        modelsDir: resolveTranslateModelsDir(app),
        defaultModel: DEFAULT_TRANSLATE_MODEL,
        models: listTranslateModels(),
      };
    } catch (err) {
      return invalidPayloadResponse(
        'Falha ao listar os modelos de tradução.',
        friendlyReport(err).suggestedAction || 'Reinicie o aplicativo e tente novamente.',
      );
    }
  });
}

/** `translate:model-status` — status de um modelo GGUF. */
export function registerModelStatusHandler() {
  ipcMain.handle('translate:model-status', async (_event, rawPayload) => {
    const { payload, response } = readTranslateModelPayload(rawPayload);
    if (!payload) return response;

    try {
      const { app } = await import('electron');
      await bindTranslateModelsDir(app);
      const { getTranslateModelStatus } = await import(TRANSLATE_MODEL_MANAGER_MODULE);
      return { ok: true, modelsDir: resolveTranslateModelsDir(app), ...getTranslateModelStatus(payload.model) };
    } catch (err) {
      return invalidPayloadResponse(
        'Falha ao verificar o modelo de tradução.',
        friendlyReport(err).suggestedAction || 'Reinicie o aplicativo e tente novamente.',
      );
    }
  });
}