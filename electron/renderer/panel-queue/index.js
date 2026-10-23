/**
 * Painel de fila de downloads — renderiza jobs, ações e dashboard.
 */

import { createDashboardAccessor } from './dashboard.js';
import { renderQueueSummary } from './summary.js';
import { renderQueueItem } from './item.js';

export function createQueuePanel({ tabsController }) {
  const dashboard = createDashboardAccessor({ tabsController });

  function handleQueueEvent(event, payload) {
    dashboard.handleEvent(event, payload);
  }

  async function refreshQueuePanel() {
    const listEl = document.getElementById('queueList');
    if (!listEl) return;

    let data;
    try {
      data = await window.api.queueList();
    } catch {
      return;
    }
    const jobs = data.jobs || [];

    renderQueueSummary({ jobs, data });

    const instance = dashboard.ensure();
    if (instance) await instance.refresh();

    listEl.innerHTML = '';
    for (const job of jobs) {
      listEl.appendChild(renderQueueItem({
        job,
        percent: Math.min(100, tabsController.jobProgress.get(job.id) || 0),
        refresh: refreshQueuePanel,
      }));
    }
  }

  return { refreshQueuePanel, handleQueueEvent };
}
