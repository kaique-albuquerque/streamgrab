/**
 * Handlers IPC de disponibilidade e criação de jobs de transcrição.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ipcMain } from 'electron';
import { friendlyReport } from '../../../src/core/errors.js';
import { validateTranscribePayload } from '../../security.js';
import { addRevealRoot, getAllowedRevealRoots } from '../state.js';
import { ensureJobManager } from './job-manager-provider.js';
import {
  MODEL_MANAGER_MODULE,
  TRANSCRIBE_MODULE,
  bindModelsDir,
  engineModelsDir,
  invalidPayloadResponse,
} from './shared.js';

/** `transcribe:check` — disponibilidade (engine + binário). */
export function registerCheckHandler() {
  ipcMain.handle('transcribe:check', async () => {
    try {
      const { app } = await import('electron');
      await bindModelsDir(app);
      const { checkTranscriptionAvailable, checkWhisperCpp, checkTransformers } = await import(TRANSCRIBE_MODULE);
      const availability = await checkTranscriptionAvailable();
      const cpp = checkWhisperCpp();
      const transformers = await checkTransformers();
      return {
        ok: availability.available,
        engine: availability.engine,
        reason: availability.reason || '',
        whisperCpp: {
          available: cpp.available,
          binPath: cpp.binPath,
          modelsDir: cpp.modelsDir,
        },
        transformers: { available: Boolean(transformers) },
      };
    } catch (err) {
      return invalidPayloadResponse(
        'Falha ao verificar disponibilidade da transcrição.',
        friendlyReport(err).suggestedAction || 'Reinicie o aplicativo e tente novamente.',
      );
    }
  });
}

/** `transcribe:start` — enfileira transcrição no job manager. */
export function registerStartHandler() {
  ipcMain.handle('transcribe:start', async (_event, rawPayload) => {
    const payload = validateTranscribePayload(rawPayload, [...getAllowedRevealRoots()]);
    if (!payload) {
      return invalidPayloadResponse(
        'Payload de transcrição inválido.',
        'Verifique o arquivo selecionado e os parâmetros e tente novamente.',
      );
    }

    if (!fs.existsSync(payload.videoPath)) {
      return invalidPayloadResponse(
        `Arquivo não encontrado: ${payload.videoPath}`,
        'O arquivo pode ter sido movido ou removido. Selecione-o novamente.',
      );
    }

    // O modelo escolhido precisa estar baixado: melhor recusar aqui do que
    // extrair o áudio inteiro para depois falhar.
    const { app } = await import('electron');
    await bindModelsDir(app);
    const { getModelStatusFor } = await import(MODEL_MANAGER_MODULE);
    const modelStatus = getModelStatusFor(payload.model, await engineModelsDir());
    if (!modelStatus.installed) {
      return invalidPayloadResponse(
        `O modelo "${modelStatus.label || payload.model}" ainda não foi baixado.`,
        'Abra a lista de modelos na aba Transcrição e baixe o modelo escolhido antes de iniciar.',
      );
    }

    // Permite "mostrar na pasta" para os arquivos gerados ao lado do vídeo.
    addRevealRoot(path.dirname(payload.videoPath));

    try {
      const manager = await ensureJobManager();
      const job = manager.enqueue(payload);
      return { ok: true, jobId: job.jobId, job };
    } catch (err) {
      return invalidPayloadResponse(
        'Falha ao enfileirar transcrição.',
        friendlyReport(err).suggestedAction || 'Reinicie o aplicativo e tente novamente.',
      );
    }
  });
}
