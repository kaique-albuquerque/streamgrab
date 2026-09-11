/**
 * Painel de fila de downloads — renderiza jobs, ações e dashboard.
 */

import { formatBytes } from './shared.js';
import { createQueueDashboard } from './queue-dashboard.js';
import { QUEUE_STATE_LABELS, TERMINAL_STATES, ACTIVE_STATES } from './panel-constants.js';

export function createQueuePanel({ tabsController }) {
  let queueDashboard = null;

  function ensureDashboard() {
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

  function handleQueueEvent(event, payload) {
    if (queueDashboard) queueDashboard.handleQueueEvent(event, payload);
  }

  async function refreshQueuePanel() {
    const listEl = document.getElementById('queueList');
    if (!listEl) return;
    const emptyEl = document.getElementById('queueEmpty');
    const summaryEl = document.getElementById('queueSummary');
    const badgeEl = document.getElementById('queueBadge');
    const toggleBtn = document.getElementById('queueTogglePauseBtn');

    let data;
    try {
      data = await window.api.queueList();
    } catch {
      return;
    }
    const jobs = data.jobs || [];
    const activeCount = jobs.filter((job) => ACTIVE_STATES.has(job.state)).length;
    const nonTerminal = jobs.filter((job) => !TERMINAL_STATES.has(job.state));
    const hasFailed = jobs.some((job) => job.state === 'failed');

    if (badgeEl) {
      badgeEl.hidden = nonTerminal.length === 0;
      badgeEl.textContent = String(nonTerminal.length);
      badgeEl.dataset.status = hasFailed ? 'error' : activeCount > 0 ? 'active' : 'idle';
    }
    if (toggleBtn) toggleBtn.textContent = data.paused ? 'Retomar fila' : 'Pausar fila';
    if (summaryEl) {
      summaryEl.textContent =
        `${activeCount}/${data.maxConcurrent} ativos · ${nonTerminal.length} na fila · ` +
        `${jobs.length - nonTerminal.length} concluidos/falhos/cancelados`;
    }
    if (emptyEl) emptyEl.hidden = jobs.length > 0;

    const dashboard = ensureDashboard();
    if (dashboard) await dashboard.refresh();

    listEl.innerHTML = '';
    for (const job of jobs) listEl.appendChild(renderQueueItem(job));
  }

  function renderQueueItem(job) {
    const item = document.createElement('div');
    item.className = 'queue-item';
    item.dataset.jobId = job.id;

    const state = job.state;
    const terminal = TERMINAL_STATES.has(state);
    const percent = Math.min(100, tabsController.jobProgress.get(job.id) || 0);
    const totalBytes = Number(job.meta?.totalBytes) || 0;

    const head = document.createElement('div');
    head.className = 'queue-item-head';
    const titleWrap = document.createElement('div');
    titleWrap.style.minWidth = '0';
    const title = document.createElement('div');
    title.className = 'queue-item-title';
    title.textContent = job.meta?.filename || job.title || 'Download';
    const sub = document.createElement('div');
    sub.className = 'queue-item-url';
    sub.textContent = job.meta?.sourceUrl || job.url || '';
    titleWrap.append(title, sub);

    const statePill = document.createElement('span');
    statePill.className = 'job-state';
    statePill.dataset.state = state;
    statePill.textContent = QUEUE_STATE_LABELS[state] || state;
    head.append(titleWrap, statePill);
    item.appendChild(head);

    const meta = document.createElement('div');
    meta.className = 'queue-item-meta';
    const bits = [`id: ${job.id}`];
    if (!terminal) bits.push(`${Math.floor(percent)}%`);
    if (totalBytes > 0) bits.push(formatBytes(totalBytes));
    if (state === 'failed' && job.error?.message) bits.push(job.error.message);
    meta.textContent = bits.join(' · ');
    item.appendChild(meta);

    if (!terminal && state !== 'paused' && percent > 0) {
      const mini = document.createElement('div');
      mini.className = 'mini-progress';
      const bar = document.createElement('div');
      bar.className = 'progress-bar';
      const fill = document.createElement('span');
      fill.style.width = `${percent}%`;
      bar.appendChild(fill);
      mini.appendChild(bar);
      item.appendChild(mini);
    }

    const actions = document.createElement('div');
    actions.className = 'queue-item-actions';
    const act = (label, fn) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'button button-ghost';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        fn().catch(() => {});
        refreshQueuePanel();
      });
      actions.appendChild(btn);
    };

    if (state === 'queued') {
      act('Cancelar', () => window.api.queueCancel(job.id));
    } else if (ACTIVE_STATES.has(state)) {
      act('Pausar', () => window.api.queuePause(job.id));
      act('Cancelar', () => window.api.queueCancel(job.id));
    } else if (state === 'paused') {
      act('Retomar', () => window.api.queueResume(job.id));
      act('Cancelar', () => window.api.queueCancel(job.id));
    } else if (terminal) {
      if (state === 'completed' && job.meta?.output) {
        act('Abrir arquivo', () => window.api.openFile({ filePath: job.meta.output }));
        act('Mostrar na pasta', () => window.api.showInFolder({ filePath: job.meta.output }));
      }
      if (state === 'failed' || state === 'cancelled') {
        act('Tentar novamente', () => window.api.queueRetry(job.id));
      }
      act('Remover', () => window.api.queueRemove(job.id));
    }
    item.appendChild(actions);
    return item;
  }

  return { refreshQueuePanel, handleQueueEvent };
}
