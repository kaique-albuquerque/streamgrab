/**
 * panel-transcribe-model.js — Seção de status/download do modelo Whisper.
 *
 * O modelo (~244 MB) é baixado em runtime para userData (model-manager.js
 * no main process); este módulo só reflete status/progresso na UI e
 * dispara download/cancel via preload.
 */

import { formatBytes } from './shared.js';

export function createModelSection() {
  let downloading = false;

  async function refreshModelStatus() {
    const infoEl = document.getElementById('transcribeModelInfo');
    const downloadBtn = document.getElementById('transcribeModelDownloadBtn');
    const cancelBtn = document.getElementById('transcribeModelCancelBtn');
    const progressWrap = document.getElementById('transcribeModelProgressWrap');
    if (!infoEl) return;

    const res = await window.api.transcribeModelStatus();
    if (!res?.ok) {
      infoEl.textContent = res?.error?.message || 'Falha ao verificar o modelo.';
      return;
    }

    if (downloading) {
      // Progresso controlado pelos eventos model-progress.
      downloadBtn?.setAttribute('hidden', '');
      cancelBtn?.removeAttribute('hidden');
      return;
    }

    cancelBtn?.setAttribute('hidden', '');
    progressWrap?.setAttribute('hidden', '');

    if (res.installed) {
      infoEl.textContent = `Instalado (${formatBytes(res.size)}) — ${res.path}`;
      downloadBtn?.setAttribute('hidden', '');
    } else {
      const partial = res.partialSize > 0 ? ` — download parcial: ${formatBytes(res.partialSize)}` : '';
      infoEl.textContent = `Não instalado${partial}. Baixe uma vez (~244 MB); depois funciona offline.`;
      downloadBtn?.removeAttribute('hidden');
      downloadBtn.textContent = res.partialSize > 0 ? 'Retomar download' : 'Baixar modelo';
    }
  }

  async function downloadModel() {
    const infoEl = document.getElementById('transcribeModelInfo');
    downloading = true;
    if (infoEl) infoEl.textContent = 'Baixando modelo... (você pode cancelar e retomar depois)';
    await refreshModelStatus();

    try {
      const res = await window.api.transcribeModelDownload();
      if (res?.ok) {
        renderModelProgress({ stage: 'done', percent: 100 });
      } else if (res?.cancelled) {
        if (infoEl) infoEl.textContent = 'Download cancelado. O progresso parcial foi mantido.';
      } else if (infoEl) {
        infoEl.textContent = res?.error?.message || 'Falha no download do modelo.';
        infoEl.style.color = 'var(--danger)';
        setTimeout(() => { infoEl.style.color = ''; }, 5000);
      }
    } finally {
      downloading = false;
      await refreshModelStatus().catch(() => {});
    }
  }

  function renderModelProgress({ percent = 0, downloaded = 0, total = 0, stage } = {}) {
    const wrap = document.getElementById('transcribeModelProgressWrap');
    const bar = document.getElementById('transcribeModelProgressBar');
    const label = document.getElementById('transcribeModelProgressLabel');
    const infoEl = document.getElementById('transcribeModelInfo');
    const cancelBtn = document.getElementById('transcribeModelCancelBtn');
    const downloadBtn = document.getElementById('transcribeModelDownloadBtn');
    const pct = Math.max(0, Math.min(100, Number(percent) || 0));

    if (stage === 'done') {
      wrap?.setAttribute('hidden', '');
      cancelBtn?.setAttribute('hidden', '');
      downloadBtn?.setAttribute('hidden', '');
      if (infoEl) infoEl.textContent = 'Instalado! Pronto para transcrever.';
      return;
    }

    wrap?.removeAttribute('hidden');
    cancelBtn?.removeAttribute('hidden');
    downloadBtn?.setAttribute('hidden', '');
    if (bar) bar.style.width = `${pct}%`;
    if (label) label.textContent = `${pct}%`;
    if (infoEl && total > 0) {
      infoEl.textContent = `Baixando... ${pct}% (${formatBytes(downloaded)} de ${formatBytes(total)})`;
    }
  }

  function bind() {
    document.getElementById('transcribeModelDownloadBtn')?.addEventListener('click', () => {
      downloadModel().catch(() => {});
    });
    document.getElementById('transcribeModelCancelBtn')?.addEventListener('click', () => {
      window.api.transcribeModelCancel().catch(() => {});
    });
  }

  return { bind, refreshModelStatus, renderModelProgress };
}
