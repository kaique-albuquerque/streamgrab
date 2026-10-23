/**
 * Compatibilidade com o fluxo antigo de cancelamento por taskId (abas).
 */

import { ipcMain } from 'electron';
import { isValidJobId, isValidTaskId } from '../../security.js';
import { getServices, taskToJob } from '../state.js';

export function registerDownloadCancelHandler() {
  ipcMain.handle('download:cancel', async (_event, rawPayload) => {
    const services = getServices();
    if (!services) return false;
    const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
    let jobId = typeof payload.jobId === 'string' && isValidJobId(payload.jobId) ? payload.jobId : '';
    if (!jobId) {
      const taskId = typeof payload.taskId === 'string' && isValidTaskId(payload.taskId) ? payload.taskId : '';
      jobId = taskToJob.get(taskId) || '';
    }
    if (!jobId) return false;
    try {
      services.queue.cancel(jobId);
      services.queue.save();
      return true;
    } catch {
      return false;
    }
  });
}
