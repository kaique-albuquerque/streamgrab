/**
 * Handlers IPC de listagem e status de modelos de transcrição.
 */

import { ipcMain } from 'electron';
import { friendlyReport } from '../../../src/core/errors.js';
import { getServices } from '../state.js';
import { getModelDownloadId } from './model-download-state.js';
import {
  MODEL_MANAGER_MODULE,
  bindModelsDir,
  engineModelsDir,
  invalidPayloadResponse,
  readModelPayload,
  resolveModelsDir,
} from './shared.js';

/** `transcribe:models` — status de todos os modelos do catálogo. */
export function registerModelsHandler() {
  ipcMain.handle('transcribe:models', async () => {
    try {
      const { app } = await import('electron');
      await bindModelsDir(app);
      const { listModelsFor, DEFAULT_MODEL } = await import(MODEL_MANAGER_MODULE);
      const modelsDir = resolveModelsDir(app);
      const selectedModel = getServices()?.settings?.get('transcribeModel') || DEFAULT_MODEL;
      return {
        ok: true,
        modelsDir,
        defaultModel: DEFAULT_MODEL,
        selectedModel,
        downloading: getModelDownloadId(),
        models: listModelsFor(await engineModelsDir()),
      };
    } catch (err) {
      return invalidPayloadResponse(
        'Falha ao listar os modelos de transcrição.',
        friendlyReport(err).suggestedAction || 'Reinicie o aplicativo e tente novamente.',
      );
    }
  });
}

/** `transcribe:model-status` — status de um modelo GGML em userData. */
export function registerModelStatusHandler() {
  ipcMain.handle('transcribe:model-status', async (_event, rawPayload) => {
    const { payload, response } = readModelPayload(rawPayload);
    if (!payload) return response;

    try {
      const { app } = await import('electron');
      await bindModelsDir(app);
      const { getModelStatusFor } = await import(MODEL_MANAGER_MODULE);
      const modelsDir = resolveModelsDir(app);
      const status = getModelStatusFor(payload.model, await engineModelsDir());
      return { ok: true, modelsDir, downloading: getModelDownloadId(), ...status };
    } catch (err) {
      return invalidPayloadResponse(
        'Falha ao verificar o modelo de transcrição.',
        friendlyReport(err).suggestedAction || 'Reinicie o aplicativo e tente novamente.',
      );
    }
  });
}
