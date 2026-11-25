/**
 * Handlers IPC de criação e controle de jobs de tradução.
 */

import { ipcMain } from 'electron';
import { friendlyReport } from '../../../src/core/errors.js';
import { validateTranslateJobPayload, validateTranslateStartPayload } from '../../security.js';
import { addRevealRoot, getAllowedRevealRoots } from '../state.js';
import { ensureJobManager } from './job-manager-provider.js';
import { TRANSLATE_MODEL_MANAGER_MODULE, bindTranslateModelsDir, invalidPayloadResponse } from './shared.js';
import path from 'node:path';

const INVALID_JOB = ['Job de tradução inválido.', 'Recarregue a aba e tente novamente.'];

/** `translate:start` — enfileira tradução no job manager. */
export function registerStartHandler() {
  ipcMain.handle('translate:start', async (_event, rawPayload) => {
    const payload = validateTranslateStartPayload(rawPayload, [...getAllowedRevealRoots()]);
    if (!payload) {
      return invalidPayloadResponse(
        'Payload de tradução inválido.',
        'Verifique o arquivo .srt selecionado e tente novamente.',
      );
    }

    const { app } = await import('electron');
    await bindTranslateModelsDir(app);
    const { getTranslateModelStatus } = await import(TRANSLATE_MODEL_MANAGER_MODULE);
    const modelStatus = getTranslateModelStatus(payload.model);
    if (!modelStatus.installed) {
      return invalidPayloadResponse(
        `O modelo "${modelStatus.label || payload.model}" ainda não foi baixado.`,
        'Baixe o modelo na aba Transcrever antes de traduzir.',
      );
    }

    addRevealRoot(path.dirname(payload.srtPath));

    try {
      const manager = await ensureJobManager();
      const job = manager.enqueue(payload);
      return { ok: true, jobId: job.jobId, job };
    } catch (err) {
      return invalidPayloadResponse(
        'Falha ao enfileirar tradução.',
        friendlyReport(err).suggestedAction || 'Reinicie o aplicativo e tente novamente.',
      );
    }
  });
}

/** `translate:cancel` — cancela job (running → abort; queued → remove). */
export function registerCancelHandler() {
  ipcMain.handle('translate:cancel', async (_event, rawPayload) => {
    const payload = validateTranslateJobPayload(rawPayload);
    if (!payload) return invalidPayloadResponse(...INVALID_JOB);
    const manager = await ensureJobManager();
    if (!manager.cancel(payload.jobId)) {
      return invalidPayloadResponse(
        'Job de tradução não encontrado ou já finalizado.',
        'Atualize a lista de jobs e tente novamente.',
      );
    }
    return { ok: true };
  });
}

/** `translate:retry` — re-enfileira job cancelado/erro. */
export function registerRetryHandler() {
  ipcMain.handle('translate:retry', async (_event, rawPayload) => {
    const payload = validateTranslateJobPayload(rawPayload);
    if (!payload) return invalidPayloadResponse(...INVALID_JOB);
    const manager = await ensureJobManager();
    if (!manager.retry(payload.jobId)) {
      return invalidPayloadResponse(
        'Job não pode ser repetido (apenas jobs com erro ou cancelados).',
        'Atualize a lista de jobs e tente novamente.',
      );
    }
    return { ok: true };
  });
}

/** `translate:remove` — remove job terminal da lista. */
export function registerRemoveHandler() {
  ipcMain.handle('translate:remove', async (_event, rawPayload) => {
    const payload = validateTranslateJobPayload(rawPayload);
    if (!payload) return invalidPayloadResponse(...INVALID_JOB);
    const manager = await ensureJobManager();
    if (!manager.remove(payload.jobId)) {
      return invalidPayloadResponse(
        'Job não pode ser removido (tradução em execução?).',
        'Aguarde terminar ou cancele o job antes de removê-lo.',
      );
    }
    return { ok: true };
  });
}

/** `translate:job-list` — jobs da sessão (com persistência em userData). */
export function registerJobListHandler() {
  ipcMain.handle('translate:job-list', async () => {
    try {
      const manager = await ensureJobManager();
      return { ok: true, jobs: manager.list() };
    } catch (err) {
      return invalidPayloadResponse(
        'Falha ao listar traduções.',
        friendlyReport(err).suggestedAction || 'Reinicie o aplicativo e tente novamente.',
      );
    }
  });
}