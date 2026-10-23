/**
 * Handler IPC de exclusão de modelos de transcrição.
 */

import { ipcMain } from 'electron';
import { friendlyReport } from '../../../src/core/errors.js';
import { getServices } from '../state.js';
import { isDownloadingModel } from './model-download-state.js';
import { externalInstallMessage, isModelInUseByActiveJob } from './model-guards.js';
import {
  MODEL_MANAGER_MODULE,
  bindModelsDir,
  engineModelsDir,
  invalidPayloadResponse,
  readModelPayload,
  resolveModelsDir,
} from './shared.js';

/** `transcribe:model-delete` — exclui os arquivos de um modelo baixado. */
export function registerModelDeleteHandler() {
  ipcMain.handle('transcribe:model-delete', async (_event, rawPayload) => {
    const { payload, response } = readModelPayload(rawPayload);
    if (!payload) return response;

    if (isDownloadingModel(payload.model)) {
      return invalidPayloadResponse(
        `Há um download em andamento para "${payload.model}".`,
        'Cancele o download antes de excluir o modelo.',
      );
    }

    try {
      const { app } = await import('electron');
      await bindModelsDir(app);
      const { deleteModel, getModelStatusFor, DEFAULT_MODEL } = await import(MODEL_MANAGER_MODULE);
      const modelsDir = resolveModelsDir(app);
      const engineDir = await engineModelsDir();

      // Modelo só existe numa instalação do whisper.cpp: não é nosso para excluir.
      const status = getModelStatusFor(payload.model, engineDir);
      const external = externalInstallMessage(payload.model, status.dir, modelsDir);
      if (status.installed && external) {
        return invalidPayloadResponse(external, 'Exclua-o manualmente por essa pasta, se desejar.');
      }

      // Nunca excluir um modelo sendo usado por um job ativo.
      if (await isModelInUseByActiveJob(payload.model)) {
        return invalidPayloadResponse(
          `O modelo "${payload.model}" está em uso por uma transcrição em andamento.`,
          'Aguarde terminar ou cancele a transcrição antes de excluir o modelo.',
        );
      }

      deleteModel(modelsDir, payload.model);

      // O modelo excluído era o padrão salvo? Volta ao padrão do aplicativo.
      const settings = getServices()?.settings;
      const previous = settings?.get('transcribeModel');
      const selectionReset = previous === payload.model;
      if (selectionReset) settings.set('transcribeModel', DEFAULT_MODEL);

      return {
        ok: true,
        model: payload.model,
        modelsDir,
        selectionReset,
        selectedModel: selectionReset ? DEFAULT_MODEL : previous,
        status: getModelStatusFor(payload.model, engineDir),
      };
    } catch (err) {
      const report = friendlyReport(err);
      return invalidPayloadResponse(
        report.message || 'Falha ao excluir o modelo.',
        report.suggestedAction || 'Feche o aplicativo e tente novamente.',
      );
    }
  });
}
