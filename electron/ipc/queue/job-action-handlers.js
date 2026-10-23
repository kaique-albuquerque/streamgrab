/**
 * Ações sobre um job específico da fila (pausar, retomar, cancelar, repetir,
 * remover). Todas respondem `false` quando o payload ou os serviços não estão
 * disponíveis, mantendo o contrato que o renderer já espera.
 */

import { ipcMain } from 'electron';
import { validateJobIdPayload } from '../../security.js';
import { getServices } from '../state.js';

function registerJobAction(channel, run) {
  ipcMain.handle(channel, async (_event, rawPayload) => {
    const payload = validateJobIdPayload(rawPayload);
    const services = getServices();
    if (!payload || !services) return false;
    try {
      return run(services.queue, payload.jobId);
    } catch {
      return false;
    }
  });
}

export function registerJobActionHandlers() {
  registerJobAction('queue:pause', (queue, jobId) => {
    queue.pause(jobId);
    return true;
  });

  registerJobAction('queue:resume', (queue, jobId) => {
    queue.resume(jobId);
    return true;
  });

  registerJobAction('queue:cancel', (queue, jobId) => {
    queue.cancel(jobId);
    queue.save();
    return true;
  });

  registerJobAction('queue:retry', (queue, jobId) => {
    const job = queue.retry(jobId);
    queue.save();
    return { ok: true, jobId: job.id };
  });

  registerJobAction('queue:remove', (queue, jobId) => {
    queue.remove(jobId);
    queue.save();
    return true;
  });
}
