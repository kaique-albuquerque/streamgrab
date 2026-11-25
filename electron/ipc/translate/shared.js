/**
 * Helpers compartilhados dos handlers IPC de tradução.
 */

import path from 'node:path';
import { BrowserWindow } from 'electron';
import { validateTranslateModelPayload } from '../../security.js';

export const TRANSLATE_MODULE = '../../../src/translate/index.js';
export const TRANSLATE_MODEL_MANAGER_MODULE = '../../../src/translate/model-manager.js';
export const TRANSLATE_JOB_MANAGER_MODULE = '../../../src/translate/job-manager.js';

/** Envia um evento para todas as janelas abertas. */
export function broadcast(channel, data) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, data);
  }
}

export function invalidPayloadResponse(message, suggestedAction) {
  return { ok: false, error: { message, suggestedAction } };
}

/** Diretório gravável dos modelos de tradução: userData/translate/models. */
export function resolveTranslateModelsDir(app) {
  return process.env.LLAMA_MODEL_DIR || path.join(app.getPath('userData'), 'translate', 'models');
}

/** Registra no model-manager onde o app grava os modelos de tradução. */
export async function bindTranslateModelsDir(app) {
  const { setTranslateModelsDirResolver } = await import(TRANSLATE_MODEL_MANAGER_MODULE);
  setTranslateModelsDirResolver(() => resolveTranslateModelsDir(app));
}

/**
 * Valida o payload de um handler `translate:model-*`.
 *
 * @returns {{ payload: { model: string } } | { response: object }}
 */
export function readTranslateModelPayload(rawPayload) {
  const payload = validateTranslateModelPayload(rawPayload);
  if (!payload) {
    return {
      response: invalidPayloadResponse(
        'Modelo de tradução inválido.',
        'Recarregue a aba de transcrição e tente novamente.',
      ),
    };
  }
  return { payload };
}