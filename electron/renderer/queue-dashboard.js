/**
 * QueueDashboard — Orquestrador do resumo visual da fila de downloads.
 *
 * SPEC-07: docs/specs/07-resumo-visual-fila.md
 *
 * Coordena métricas, renderização e auto-refresh. Módulos dedicados:
 *  - dashboard-metrics.js   → rastreamento de speed/ETA/percent por job
 *  - dashboard-render.js    → renderização HTML (cards, disco, progresso)
 *  - dashboard-formatters.js → formatBytes, formatSpeed, formatEta, escapeHtml
 */

import { createMetricsTracker } from './dashboard-metrics.js';
import { renderDashboard, renderProgress } from './dashboard-render.js';

const QUEUED_STATES = new Set(['queued']);
const REFRESH_INTERVAL_MS = 2000;
const DISK_CACHE_MS = 30000;

export function createQueueDashboard({ container, api, getJobProgress }) {
  let refreshTimer = null;
  let diskCache = null;
  let diskCacheTime = 0;

  const metrics = createMetricsTracker();

  async function fetchDiskSpace() {
    if (diskCache && Date.now() - diskCacheTime < DISK_CACHE_MS) return diskCache;
    try {
      const space = await api.diskSpace({});
      diskCache = space;
      diskCacheTime = Date.now();
      return space;
    } catch {
      return null;
    }
  }

  async function refresh() {
    if (!container) return;

    let data;
    try {
      data = await api.queueList();
    } catch {
      return;
    }

    const jobs = data?.jobs || [];
    const active = jobs.filter((j) => metrics.ACTIVE_STATES.has(j.state));
    const queued = jobs.filter((j) => QUEUED_STATES.has(j.state));
    const completed = jobs.filter((j) => j.state === 'completed');
    const failed = jobs.filter((j) => j.state === 'failed');

    let totalSpeedBps = 0;
    for (const job of active) {
      const speed = metrics.getMetric(job.id, 'speed');
      if (speed > 0) totalSpeedBps += speed;
    }

    let totalBytes = 0;
    let downloadedBytes = 0;
    for (const job of active) {
      const jobTotal = metrics.getMetric(job.id, 'totalBytes') || Number(job.meta?.totalBytes) || 0;
      const pct = Math.min(100, metrics.getPercent(job, getJobProgress));
      totalBytes += jobTotal;
      downloadedBytes += Math.round(jobTotal * (pct / 100));
    }

    const remaining = Math.max(0, totalBytes - downloadedBytes);
    const etaSeconds = totalSpeedBps > 0 ? remaining / totalSpeedBps : 0;

    const disk = await fetchDiskSpace();

    renderDashboard({ container, active, queued, completed, failed, totalSpeedBps, etaSeconds, totalBytes, downloadedBytes, disk });

    if (active.length > 0 || queued.length > 0) startAutoRefresh();
    else stopAutoRefresh();
  }

  function startAutoRefresh() {
    if (refreshTimer) return;
    refreshTimer = setInterval(() => refresh(), REFRESH_INTERVAL_MS);
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function destroy() {
    stopAutoRefresh();
    metrics.clear();
    if (container) container.innerHTML = '';
  }

  return { refresh, handleQueueEvent: metrics.handleQueueEvent, startAutoRefresh, stopAutoRefresh, destroy };
}