/**
 * Fila — dashboard de throughput e espaço em disco.
 */

import { createQueueDashboard } from '../queue-dashboard.js';

/** Acesso preguiçoso ao dashboard da fila. */
export function createDashboardAccessor({ tabsController }) {
  let queueDashboard = null;

  function ensure() {
    if (queueDashboard) return queueDashboard;
    const container = document.getElementById('queueDashboard');
    if (!container) return null;
    queueDashboard = createQueueDashboard({
      container,
      api: {
        queueList: () => window.api.queueList(),
        diskSpace: (payload) => window.api.diskSpace(payload),
      },
      getJobProgress: (jobId) => tabsController.jobProgress?.get(jobId),
    });
    return queueDashboard;
  }

  function handleEvent(event, payload) {
    if (queueDashboard) queueDashboard.handleQueueEvent(event, payload);
  }

  return { ensure, handleEvent };
}
