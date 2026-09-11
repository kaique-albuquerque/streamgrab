/**
 * Renderização HTML do dashboard — cards, disco, progresso.
 */

import { formatBytes, formatSpeed, formatEta, escapeHtml } from './dashboard-formatters.js';

export function renderDashboard({ container, active, queued, completed, failed, totalSpeedBps, etaSeconds, totalBytes, downloadedBytes, disk }) {
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

export function renderProgress(active, totalBytes, downloadedBytes, getPercent, getMetric) {
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
