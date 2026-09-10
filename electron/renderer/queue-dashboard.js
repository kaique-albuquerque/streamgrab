/**
 * QueueDashboard — Resumo visual da fila de downloads.
 *
 * SPEC-07: docs/specs/07-resumo-visual-fila.md
 *
 * Renderiza cards de métricas (ativos, na fila, concluídos, velocidade, ETA),
 * espaço em disco e barras de progresso individuais por job ativo.
 */

const ACTIVE_STATES = new Set(['analyzing', 'preparing', 'downloading', 'merging']);
const QUEUED_STATES = new Set(['queued']);
const REFRESH_INTERVAL_MS = 2000;
const DISK_CACHE_MS = 30000;

export function createQueueDashboard({ container, api, getJobProgress }) {
  let refreshTimer = null;
  let diskCache = null;
  let diskCacheTime = 0;
  // jobId -> { speed, etaSeconds, percent, totalBytes }
  const jobMetrics = new Map();

  /**
   * Recebe eventos da fila/engine para atualizar métricas em tempo real.
   */
  function handleQueueEvent(event, payload) {
    payload = payload || {};
    const jobId = payload.jobId;
    if (!jobId) return;

    const current = jobMetrics.get(jobId) || {};

    switch (event) {
      case 'start':
      case 'progress':
        {
          const percent = Number(payload.percent);
          const totalBytes = Number(payload.totalBytes) || current.totalBytes || 0;
          jobMetrics.set(jobId, {
            ...current,
            percent: Number.isFinite(percent) ? percent : current.percent,
            totalBytes,
          });
        }
        break;
      case 'speed':
        jobMetrics.set(jobId, { ...current, speed: Number(payload.speed) || 0 });
        break;
      case 'eta':
        jobMetrics.set(jobId, { ...current, etaSeconds: Number(payload.etaSeconds) || 0 });
        break;
      case 'complete':
      case 'error':
      case 'cancel':
        jobMetrics.delete(jobId);
        break;
      default:
        break;
    }
  }

  function getMetric(jobId, key) {
    const m = jobMetrics.get(jobId);
    if (m && m[key] != null) return m[key];
    return null;
  }

  function getPercent(job) {
    // Tenta do dashboard, depois do tabsController.jobProgress
    const fromDash = getMetric(job.id, 'percent');
    if (fromDash != null) return fromDash;
    const fromTabs = getJobProgress ? getJobProgress(job.id) : null;
    if (fromTabs != null) return Number(fromTabs) || 0;
    return 0;
  }

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
    const active = jobs.filter((j) => ACTIVE_STATES.has(j.state));
    const queued = jobs.filter((j) => QUEUED_STATES.has(j.state));
    const completed = jobs.filter((j) => j.state === 'completed');
    const failed = jobs.filter((j) => j.state === 'failed');

    // Velocidade total (soma de todos os jobs ativos)
    let totalSpeedBps = 0;
    for (const job of active) {
      const speed = getMetric(job.id, 'speed');
      if (speed > 0) totalSpeedBps += speed;
    }

    // Bytes totais e baixados (apenas jobs ativos)
    let totalBytes = 0;
    let downloadedBytes = 0;
    for (const job of active) {
      const jobTotal = getMetric(job.id, 'totalBytes') || Number(job.meta?.totalBytes) || 0;
      const pct = Math.min(100, getPercent(job));
      totalBytes += jobTotal;
      downloadedBytes += Math.round(jobTotal * (pct / 100));
    }

    // ETA
    const remaining = Math.max(0, totalBytes - downloadedBytes);
    const etaSeconds = totalSpeedBps > 0 ? remaining / totalSpeedBps : 0;

    const disk = await fetchDiskSpace();

    render({ active, queued, completed, failed, totalSpeedBps, etaSeconds, totalBytes, downloadedBytes, disk });

    // Auto-refresh enquanto houver jobs ativos (ou na fila aguardando vaga)
    if (active.length > 0 || queued.length > 0) startAutoRefresh();
    else stopAutoRefresh();
  }

  function render({ active, queued, completed, failed, totalSpeedBps, etaSeconds, totalBytes, downloadedBytes, disk }) {
    const cards = [
      card('active', '🟢 Ativos', String(active.length), `${queued.length + active.length} na fila`),
      card('queue', '⏳ Na fila', String(queued.length), ''),
      card('done', '✅ Concluídos', String(completed.length), failed.length > 0 ? `${failed.length} falharam` : '', failed.length > 0),
      card('speed', '⚡ Velocidade', formatSpeed(totalSpeedBps), ''),
      card('eta', '⏱ ETA', etaSeconds > 0 ? formatEta(etaSeconds) : '—', ''),
    ].join('');

    const diskHtml = disk && disk.total ? renderDisk(disk) : '';
    const progressHtml = active.length > 0 ? renderProgress(active, totalBytes, downloadedBytes) : '';

    container.innerHTML = `
      <div class="dash-grid">${cards}</div>
      ${diskHtml}
      ${progressHtml}
    `;
  }

  function card(kind, label, value, sub, isError = false) {
    const subHtml = sub ? `<div class="dash-sub${isError ? ' error' : ''}">${escapeHtml(sub)}</div>` : '';
    return `
      <div class="dash-card dash-card-${kind}">
        <div class="dash-label">${escapeHtml(label)}</div>
        <div class="dash-value">${escapeHtml(value)}</div>
        ${subHtml}
      </div>
    `;
  }

  function renderDisk(disk) {
    const usedPct = disk.total > 0 ? Math.round((disk.used / disk.total) * 100) : 0;
    return `
      <div class="dash-disk">
        <div class="dash-label">💾 Espaço em disco</div>
        <div class="dash-sub">${formatBytes(disk.free)} livres de ${formatBytes(disk.total)}</div>
        <div class="progress-bar disk"><span style="width:${usedPct}%"></span></div>
      </div>
    `;
  }

  function renderProgress(active, totalBytes, downloadedBytes) {
    const barsHtml = active
      .map((job) => {
        const pct = Math.min(100, Math.floor(getPercent(job)));
        const filename = job.meta?.filename || job.title || 'Download';
        const speed = getMetric(job.id, 'speed');
        const speedHtml = speed > 0 ? `<span class="mini-job-speed">${formatSpeed(speed)}</span>` : '';
        return `
          <div class="mini-job">
            <div class="mini-job-head">
              <span class="mini-job-name">${escapeHtml(filename)}</span>
              <span class="mini-job-pct">${pct}%</span>
              ${speedHtml}
            </div>
            <div class="progress-bar mini"><span style="width:${pct}%"></span></div>
          </div>
        `;
      })
      .join('');

    const accPct = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;

    return `
      <div class="dash-progress">
        <div class="dash-label">📈 Progresso acumulado</div>
        <div class="dash-sub">${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)} (${accPct}%)</div>
        ${barsHtml}
      </div>
    `;
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
    jobMetrics.clear();
    if (container) container.innerHTML = '';
  }

  return { refresh, handleQueueEvent, startAutoRefresh, stopAutoRefresh, destroy };
}

// ---------------------------------------------------------------------------
// Formatadores
// ---------------------------------------------------------------------------

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v.toFixed(i ? 1 : 0)} ${units[i]}`;
}

function formatSpeed(bps) {
  const n = Number(bps);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB/s`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} KB/s`;
  return `${Math.round(n)} B/s`;
}

function formatEta(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return '—';
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min ${Math.round(s % 60)}s`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return `${h}h ${m}min`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}