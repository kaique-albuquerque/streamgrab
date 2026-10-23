/**
 * Configuração de ambiente do processo principal.
 *
 * - Em produção os binários ficam em `extraResources` (P10, seção 7).
 * - O modelo do whisper é baixado em runtime para um diretório gravável
 *   (o instalador é read-only).
 */

import path from 'node:path';

import { app } from 'electron';

import { RESOURCES_PATH_ENV } from '../../src/core/binaries.js';

/** Aponta os binários para `process.resourcesPath` no app empacotado. */
export function configurePackagedResources() {
  if (app.isPackaged && process.resourcesPath) {
    process.env[RESOURCES_PATH_ENV] = process.resourcesPath;
  }
}

/** Define WHISPER_MODEL_DIR (valor já existente tem prioridade). */
export function configureWhisperModelDir(userDataDir) {
  if (!process.env.WHISPER_MODEL_DIR) {
    process.env.WHISPER_MODEL_DIR = path.join(userDataDir, 'whisper', 'models');
  }
}
