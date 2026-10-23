/**
 * Helpers compartilhados dos handlers IPC de transcrição.
 */

import path from 'node:path';
import { BrowserWindow } from 'electron';
import { validateModelPayload } from '../../security.js';

export const TRANSCRIBE_MODULE = '../../../src/transcribe/index.js';
export const MODEL_MANAGER_MODULE = '../../../src/transcribe/model-manager.js';
export const JOB_MANAGER_MODULE = '../../../src/transcribe/job-manager.js';

/** Envia um evento para todas as janelas abertas. */
export function broadcast(channel, data) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, data);
  }
}

export function invalidPayloadResponse(message, suggestedAction) {
  return { ok: false, error: { message, suggestedAction } };
}

/** Diretório gravável dos modelos: userData/whisper/models (env tem prioridade). */
export function resolveModelsDir(app) {
  return process.env.WHISPER_MODEL_DIR || path.join(app.getPath('userData'), 'whisper', 'models');
}

/**
 * Registra no model-manager onde o app grava os modelos.
 *
 * Sem isso o motor procuraria o modelo apenas ao lado do binário do
 * whisper.cpp e um modelo baixado pela interface nunca seria encontrado.
 */
export async function bindModelsDir(app) {
  const { setModelsDirResolver } = await import(MODEL_MANAGER_MODULE);
  setModelsDirResolver(() => resolveModelsDir(app));
}

/** Diretório de modelos do motor (whisper.cpp), usado como fallback de leitura. */
export async function engineModelsDir() {
  const { checkWhisperCpp } = await import(TRANSCRIBE_MODULE);
  return checkWhisperCpp().modelsDir;
}

/**
 * Valida o payload de um handler `transcribe:model-*`.
 *
 * @returns {{ payload: { model: string } } | { response: object }}
 */
export function readModelPayload(rawPayload) {
  const payload = validateModelPayload(rawPayload);
  if (!payload) {
    return {
      response: invalidPayloadResponse(
        'Modelo de transcrição inválido.',
        'Recarregue a aba de transcrição e tente novamente.',
      ),
    };
  }
  return { payload };
}
