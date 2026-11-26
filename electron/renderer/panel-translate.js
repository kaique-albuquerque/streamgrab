/**
 * Painel de tradução de legendas (card na aba Transcrever).
 *
 * Consome `window.api.translate*` e reflete o estado via eventos. O job manager
 * roda no main process; este painel apenas espelha o estado e dispara ações.
 */

import { createTranslateActions } from './panel-translate/start.js';
import { createTranslateModelSection } from './panel-translate/model.js';

/** Normaliza o percentual para 0..100. */
function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

/**
 * Cria o painel de tradução.
 *
 * @param {object} [deps]
 * @param {object} [deps.api] - API do preload (default: window.api)
 * @param {object} [deps.doc] - Documento (default: document)
 */
export function createTranslatePanel({ api, doc } = {}) {
  // Aceita tanto a função `() => window.api` quanto o objeto direto.
  const apiFn = typeof api === 'function' ? api : () => api || window.api;
  const docRef = doc || (typeof document !== 'undefined' ? document : null);
  const jobs = new Map();
  let wired = false;

  const modelSection = createTranslateModelSection({ api: apiFn, doc: docRef });
  const actions = createTranslateActions({ api: apiFn, doc: docRef, jobs, renderList });

  function renderList() {
    const listEl = docRef?.getElementById('translateList');
    if (!listEl) return;
    listEl.textContent = '';
    for (const job of jobs.values()) {
      const item = docRef.createElement('div');
      item.className = 'queue-item';
      item.dataset.jobId = job.jobId;
      const title = docRef.createElement('div');
      title.className = 'queue-item-title';
      title.textContent = job.srtPath?.split(/[\\/]/).pop() || job.srtPath || 'Legenda';
      const pill = docRef.createElement('span');
      pill.className = 'job-state';
      pill.dataset.state = job.status || 'queued';
      pill.textContent = actions.labels[job.status] || job.status || '';
      item.append(title, pill);
      listEl.appendChild(item);
    }
  }

  function ensureWired() {
    if (wired || !docRef) return;
    wired = true;
    docRef.getElementById('translateStartBtn')?.addEventListener('click', () => {
      actions.start().catch(() => {});
    });
    docRef.getElementById('translateModelDownloadBtn')?.addEventListener('click', () => {
      actions.downloadModel().catch(() => {});
    });
  }

  async function refresh() {
    ensureWired();
    await Promise.all([modelSection.refresh().catch(() => {}), refreshJobs().catch(() => {})]);
  }

  async function refreshJobs() {
    const res = await apiFn().translateJobList();
    if (!res?.ok) return;
    jobs.clear();
    for (const job of res.jobs || []) jobs.set(job.jobId, job);
    renderList();
  }

  function handleEvent(type, data) {
    if (type === 'progress') {
      // O broadcast de progresso pode chegar antes do job-list: cria o
      // espelho do job se ainda não existir.
      const job = jobs.get(data?.jobId) || { jobId: data?.jobId, status: 'running', percent: 0 };
      if (typeof data.percent === 'number') job.percent = data.percent;
      if (data.stage) job.stage = data.stage;
      jobs.set(job.jobId, job);
      updateProgressDom(job);
      return;
    }
    if (type === 'done') {
      const job = jobs.get(data?.jobId) || { jobId: data?.jobId, status: 'done', percent: 0 };
      job.percent = 100;
      job.status = 'done';
      jobs.set(job.jobId, job);
      updateProgressDom(job);
      return;
    }
    if (type === 'job-updated' || type === 'error') {
      if (data?.jobId) jobs.set(data.jobId, { ...jobs.get(data.jobId), ...data });
      renderList();
    }
  }

  /** Atualiza o texto de percentual do item no DOM (se existir). */
  function updateProgressDom(job) {
    const listEl = docRef?.getElementById('translateList');
    const item = listEl && listEl.querySelector?.(`[data-job-id="${job.jobId}"]`);
    const label = item?.querySelector?.('.transcribe-progress-label');
    if (label) {
      label.textContent = `${clampPercent(job.percent)}%`;
      return;
    }
    // Sem item no DOM (ex.: doc fake em teste): atualiza o elemento de
    // percentual exposto pelo doc, quando houver.
    const fallback = docRef?.getElementById?.('translatePercent');
    if (fallback) fallback.textContent = `${clampPercent(job.percent)}%`;
  }

  return { refresh, handleEvent, renderList };
}