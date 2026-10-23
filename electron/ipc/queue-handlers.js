/**
 * Handlers IPC de download, fila e lote — StreamGrabCore + DownloadQueue.
 *
 * Canais:
 *  - download:start   → enfileira um download a partir da aba
 *  - download:cancel  → cancela por jobId ou pelo taskId antigo
 *  - queue:enqueue    → enfileira um download
 *  - queue:list       → snapshot da fila (jobs, maxConcurrent, paused)
 *  - queue:setPaused  → pausa/retoma a fila global
 *  - queue:pause      → pausa um job
 *  - queue:resume     → retoma um job
 *  - queue:cancel     → cancela um job
 *  - queue:retry      → recria um job a partir de um job falho
 *  - queue:remove     → remove um job da fila
 *  - batch:enqueue    → SPEC-03: download em lote
 *
 * A implementação vive em `./queue/`, um arquivo por responsabilidade.
 */

import { registerBatchEnqueueHandler } from './queue/batch-handler.js';
import { registerDownloadCancelHandler } from './queue/cancel-handler.js';
import {
  registerDownloadStartHandler,
  registerQueueEnqueueHandler,
  registerQueueListHandler,
  registerQueueSetPausedHandler,
} from './queue/enqueue-handlers.js';
import { registerJobActionHandlers } from './queue/job-action-handlers.js';

export { enqueueDownload } from './queue/enqueue.js';

/** Registra todos os canais IPC de download, fila e lote. */
export function registerQueueHandlers() {
  registerDownloadStartHandler();
  registerQueueEnqueueHandler();
  registerQueueListHandler();
  registerQueueSetPausedHandler();
  registerJobActionHandlers();
  registerDownloadCancelHandler();
  registerBatchEnqueueHandler();
}
