import { applyTheme, formatBytes, formatDate, initializeTheme } from './shared.js';
import { createQueueDashboard } from './queue-dashboard.js';
import { createHistoryFilters } from './history-filters.js';

const QUEUE_STATE_LABELS = {
  queued: 'Aguardando',
  analyzing: 'Analisando',
  preparing: 'Preparando',
  downloading: 'Baixando',
  paused: 'Pausado',
  merging: 'Mesclando',
  completed: 'Concluido',
  failed: 'Falhou',
  cancelled: 'Cancelado',
};

const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled']);
const ACTIVE_STATES = new Set(['analyzing', 'preparing', 'downloading', 'merging']);
const VIEWS = ['videos', 'queue', 'history', 'settings'];

export function createPanelsController({ dom, tabsController }) {
  let queueDashboard = null;
  let historyFilters = null;

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

    // SPEC-07: dashboard de resumo visual
    const dashboard = ensureDashboard();
    if (dashboard) await dashboard.refresh();

    listEl.innerHTML = '';
    for (const job of jobs) listEl.appendChild(renderQueueItem(job));
  }

  /** Encaminha eventos da fila/engine para o dashboard (speed, eta, progress). */
  function handleQueueEvent(event, payload) {
    if (queueDashboard) queueDashboard.handleQueueEvent(event, payload);
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

  async function refreshHistoryPanel() {
    const listEl = document.getElementById('historyList');
    if (!listEl) return;

    let entries;
    try {
      entries = await window.api.historyList();
    } catch {
      return;
    }
    const list = entries || [];

    ensureHistoryFilters();
    if (historyFilters) {
      // A filtragem client-side chama renderHistoryEntries via onFiltered.
      historyFilters.setEntries(list);
      return;
    }

    // Fallback (filtros indisponíveis): renderiza tudo.
    renderHistoryEntries(list, list.length);
  }

  /** Cria o controlador de filtros do histórico (uma única vez). */
  function ensureHistoryFilters() {
    if (historyFilters) return historyFilters;
    const searchInput = document.getElementById('historySearch');
    if (!searchInput) return null;

    historyFilters = createHistoryFilters({
      onFiltered: (filtered, total) => renderHistoryEntries(filtered, total),
    });

    searchInput.addEventListener('input', () => historyFilters?.setFilter('search', searchInput.value));

    const periodGroup = document.getElementById('historyPeriodGroup');
    if (periodGroup) {
      periodGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-period]');
        if (!btn) return;
        periodGroup.querySelectorAll('[data-period]').forEach((b) => b.classList.toggle('active', b === btn));
        historyFilters?.setFilter('period', btn.dataset.period);
      });
    }

    const statusGroup = document.getElementById('historyStatusGroup');
    if (statusGroup) {
      statusGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-status]');
        if (!btn) return;
        statusGroup.querySelectorAll('[data-status]').forEach((b) => b.classList.toggle('active', b === btn));
        historyFilters?.setFilter('status', btn.dataset.status);
      });
    }

    const exportCsvBtn = document.getElementById('historyExportCsvBtn');
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => exportHistory('csv'));

    const exportJsonBtn = document.getElementById('historyExportJsonBtn');
    if (exportJsonBtn) exportJsonBtn.addEventListener('click', () => exportHistory('json'));

    const sortSelect = document.getElementById('historySort');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => historyFilters?.setSort(sortSelect.value));
    }

    const resetBtn = document.getElementById('historyResetFiltersBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        historyFilters?.reset();
        if (searchInput) searchInput.value = '';
        if (sortSelect) sortSelect.value = 'date';
        periodGroup?.querySelectorAll('[data-period]').forEach((b) => b.classList.toggle('active', b.dataset.period === 'all'));
        statusGroup?.querySelectorAll('[data-status]').forEach((b) => b.classList.toggle('active', b.dataset.status === 'all'));
      });
    }

    return historyFilters;
  }

  /** Renderiza as entradas (já filtradas) do histórico. */
  function renderHistoryEntries(visible, total) {
    const listEl = document.getElementById('historyList');
    if (!listEl) return;
    const emptyEl = document.getElementById('historyEmpty');
    const summaryEl = document.getElementById('historySummary');

    const count = visible.length;
    if (summaryEl) {
      summaryEl.textContent = count === total
        ? `${total} registro${total === 1 ? '' : 's'}`
        : `${count} de ${total} registro${total === 1 ? '' : 's'}`;
    }

    listEl.innerHTML = '';
    if (count === 0) {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = total > 0
          ? 'Nenhum download encontrado. Tente ajustar a busca ou os filtros.'
          : 'Nenhum download registrado ainda.';
      }
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    for (const entry of visible) listEl.appendChild(renderHistoryItem(entry));
  }

  /** SPEC-08: exporta o histórico (respeitando os filtros ativos). */
  async function exportHistory(format) {
    const entries = historyFilters ? historyFilters.getVisible() : undefined;
    const result = await window.api.exportHistory({ format, entries });

    if (result?.ok) {
      const size = formatBytes(result.size || 0);
      historyStatus(`Histórico exportado: ${result.count ?? '?'} registros (${size}).`);
    } else if (result?.canceled) {
      // usuário cancelou o diálogo: silencioso
    } else {
      historyStatus(result?.error || 'Falha ao exportar o histórico.', false);
    }
  }

  function historyStatus(text, ok = true) {
    const el = document.getElementById('historySummary');
    if (el) {
      el.textContent = text;
      el.style.color = ok ? '' : 'var(--danger)';
      setTimeout(() => { el.style.color = ''; }, 4000);
    }
  }

  function renderHistoryItem(entry) {
    const item = document.createElement('div');
    item.className = 'queue-item';
    const head = document.createElement('div');
    head.className = 'queue-item-head';
    const titleWrap = document.createElement('div');
    titleWrap.style.minWidth = '0';
    const title = document.createElement('div');
    title.className = 'queue-item-title';
    title.textContent = entry.title || entry.url;
    const sub = document.createElement('div');
    sub.className = 'queue-item-url';
    sub.textContent = entry.url || '';
    titleWrap.append(title, sub);

    const statePill = document.createElement('span');
    statePill.className = 'job-state';
    statePill.dataset.state = entry.status || 'completed';
    statePill.textContent = QUEUE_STATE_LABELS[entry.status] || entry.status || 'Concluido';
    head.append(titleWrap, statePill);
    item.appendChild(head);

    const meta = document.createElement('div');
    meta.className = 'queue-item-meta';
    const bits = [];
    if (entry.date) bits.push(formatDate(entry.date));
    if (entry.provider) bits.push(entry.provider);
    if (entry.format) bits.push(entry.format);
    if (entry.size) bits.push(formatBytes(entry.size));
    if (entry.destination) bits.push(entry.destination);
    meta.textContent = bits.join(' · ');
    item.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'queue-item-actions';
    const act = (label, fn) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'button button-ghost';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        fn().catch(() => {});
        refreshHistoryPanel();
        refreshQueuePanel();
      });
      actions.appendChild(btn);
    };

    if (entry.destination) {
      act('Abrir arquivo', () => window.api.openFile({ filePath: entry.destination }));
      act('Mostrar na pasta', () => window.api.showInFolder({ filePath: entry.destination }));
    }
    act('Baixar de novo', () => window.api.historyRedownload(entry.id));
    act('Remover', () => window.api.historyRemove(entry.id));
    item.appendChild(actions);
    return item;
  }

  async function renderSettingsPanel() {
    const form = document.getElementById('settingsForm');
    if (!form) return;
    let settings;
    try {
      settings = await window.api.settingsGet();
    } catch {
      return;
    }
    for (const input of form.querySelectorAll('[data-setting]')) {
      const key = input.dataset.setting;
      const value = settings[key];
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else if (input.type === 'number') input.value = value == null ? '' : String(value);
      else input.value = value == null ? '' : String(value);
    }
  }

  function collectSettingsForm() {
    const form = document.getElementById('settingsForm');
    const partial = {};
    for (const input of form.querySelectorAll('[data-setting]')) {
      const key = input.dataset.setting;
      if (input.type === 'checkbox') partial[key] = input.checked;
      else if (input.type === 'number') {
        const n = Number(input.value);
        partial[key] = Number.isFinite(n) ? n : null;
      } else {
        partial[key] = input.value.trim();
      }
    }
    return partial;
  }

  function settingsStatus(text, ok = true) {
    const el = document.querySelector('[data-field="settingsStatus"]');
    if (el) {
      el.textContent = text;
      el.style.color = ok ? 'var(--accent)' : 'var(--danger)';
    }
  }

  function switchView(name) {
    if (!VIEWS.includes(name)) return;
    for (const viewName of VIEWS) {
      const view = document.getElementById(`view-${viewName}`);
      const btn = document.getElementById(
        { videos: 'viewVideosBtn', queue: 'viewQueueBtn', history: 'viewHistoryBtn', settings: 'viewSettingsBtn' }[viewName]
      );
      if (view) view.hidden = viewName !== name;
      if (btn) btn.classList.toggle('active', viewName === name);
    }
    if (name === 'queue') refreshQueuePanel();
    if (name === 'history') refreshHistoryPanel();
    if (name === 'settings') renderSettingsPanel();
  }

  function initializePanels() {
    const wire = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };

    wire('viewVideosBtn', () => switchView('videos'));
    wire('viewQueueBtn', () => switchView('queue'));
    wire('viewHistoryBtn', () => switchView('history'));
    wire('viewSettingsBtn', () => switchView('settings'));

    wire('queueRefreshBtn', () => refreshQueuePanel());
    wire('queueTogglePauseBtn', async () => {
      const btn = document.getElementById('queueTogglePauseBtn');
      const shouldPause = btn?.textContent.trim() === 'Pausar fila';
      await window.api.queueSetPaused(shouldPause);
      refreshQueuePanel();
    });

    wire('historyRefreshBtn', () => refreshHistoryPanel());
    wire('historyClearBtn', async () => {
      await window.api.historyClear();
      refreshHistoryPanel();
    });

    wire('settingsSaveBtn', async () => {
      const partial = collectSettingsForm();
      const res = await window.api.settingsUpdate(partial);
      if (res?.ok) {
        settingsStatus('Configuracoes salvas.');
        if (partial.theme === 'light' || partial.theme === 'dark') {
          localStorage.setItem('vd-theme', partial.theme);
          applyTheme(partial.theme, dom.themeLabel);
        }
        refreshQueuePanel();
      } else {
        settingsStatus(res?.error || 'Falha ao salvar.', false);
      }
    });

    wire('settingsResetBtn', async () => {
      await window.api.settingsReset();
      await renderSettingsPanel();
      settingsStatus('Configuracoes restauradas para o padrao.');
    });

    wire('settingsPickDirBtn', async () => {
      const picked = await window.api.pickOutputDir();
      if (picked) {
        const input = document.querySelector('[data-setting="defaultDir"]');
        if (input) input.value = picked;
      }
    });

    refreshQueuePanel();
    refreshHistoryPanel();
    renderSettingsPanel();
  }

  return {
    initializeTheme() {
      initializeTheme(dom.themeToggle, dom.themeLabel);
    },
    initializePanels,
    refreshQueuePanel,
    refreshHistoryPanel,
    handleQueueEvent,
  };
}
