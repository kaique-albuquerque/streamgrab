/**
 * Handlers IPC de controle dos jobs (cancelar, repetir, remover e listar).
 */

import { ipcMain } from 'electron';
import { friendlyReport } from '../../../src/core/errors.js';
import { validateTranscribeJobPayload } from '../../security.js';
import { ensureJobManager } from './job-manager-provider.js';
import { invalidPayloadResponse } from './shared.js';

const INVALID_JOB = ['Job de transcrição inválido.', 'Recarregue a aba e tente novamente.'];

/** `transcribe:cancel` — cancela job (running → abort; queued → remove). */
export function registerCancelHandler() {
  ipcMain.handle('transcribe:cancel', async (_event, rawPayload) => {
    const payload = validateTranscribeJobPayload(rawPayload);
    if (!payload) return invalidPayloadResponse(...INVALID_JOB);
    const manager = await ensureJobManager();
    const cancelled = manager.cancel(payload.jobId);
    if (!cancelled) {
      return invalidPayloadResponse(
        'Job de transcrição não encontrado ou já finalizado.',
        'Atualize a lista de jobs e tente novamente.',
      );
    }
    return { ok: true };
  });
}

/** `transcribe:retry` — re-enfileira job cancelado/erro. */
export function registerRetryHandler() {
  ipcMain.handle('transcribe:retry', async (_event, rawPayload) => {
    const payload = validateTranscribeJobPayload(rawPayload);
    if (!payload) return invalidPayloadResponse(...INVALID_JOB);
    const manager = await ensureJobManager();
    const requeued = manager.retry(payload.jobId);
    if (!requeued) {
      return invalidPayloadResponse(
        'Job não pode ser repetido (apenas jobs com erro ou cancelados).',
        'Atualize a lista de jobs e tente novamente.',
      );
    }
    return { ok: true };
  });
}

/** `transcribe:remove` — remove job terminal da lista. */
export function registerRemoveHandler() {
  ipcMain.handle('transcribe:remove', async (_event, rawPayload) => {
    const payload = validateTranscribeJobPayload(rawPayload);
    if (!payload) return invalidPayloadResponse(...INVALID_JOB);
    const manager = await ensureJobManager();
    const removed = manager.remove(payload.jobId);
    if (!removed) {
      return invalidPayloadResponse(
        'Job não pode ser removido (transcrição em execução?).',
        'Aguarde terminar ou cancele o job antes de removê-lo.',
      );
    }
    return { ok: true };
  });
}

/** `transcribe:job-list` — jobs da sessão (com persistência em userData). */
export function registerJobListHandler() {
  ipcMain.handle('transcribe:job-list', async () => {
    try {
      const manager = await ensureJobManager();
      return { ok: true, jobs: manager.list() };
    } catch (err) {
      return invalidPayloadResponse(
        'Falha ao listar transcrições.',
        friendlyReport(err).suggestedAction || 'Reinicie o aplicativo e tente novamente.',
      );
    }
  });
}
