/**
 * panel-transcribe.js — Painel de transcrição (view "Transcrever").
 *
 * Consome a API do preload (window.api.transcribe*):
 *  - transcribeCheck → status do engine
 *  - transcribeModels / transcribeModelDownload / transcribeModelCancel /
 *    transcribeModelDelete → catálogo de modelos (download em runtime)
 *  - transcribeStart / transcribeCancel / transcribeRetry / transcribeJobList
 *  - eventos: onTranscribeProgress/Log/Done/Error/JobUpdated/ModelProgress
 *
 * O job manager roda no main process (limite de concorrência, retry,
 * persistência); este painel apenas reflete o estado via eventos.
 * Renderização da lista vive em panel-transcribe-jobs.js.
 */

import { createJobListRenderer } from './panel-transcribe-jobs.js';
import { createModelSection } from './panel-transcribe-model.js';

export function createTranscribePanel() {
  /** jobId → snapshot do job (espelho do main). */
  const jobs = new Map();

  let wired = false;

  const modelSection = createModelSection();
  const jobList = createJobListRenderer({
    onJobAction: (action, target) => handleJobAction(action, target),
  });

  function ensureWired() {
    if (wired) return;
    wired = true;

    document.getElementById('transcribeRefreshBtn')?.addEventListener('click', () => refreshTranscribePanel());
    document.getElementById('transcribeStartBtn')?.addEventListener('click', () => {
      startTranscription().catch(() => {});
    });
    modelSection.bind();
  }

  // ------------------------------------------------------------- refresh

  async function refreshTranscribePanel() {
    ensureWired();
    await Promise.all([
      refreshEngineStatus().catch(() => {}),
      modelSection.refreshModels().catch(() => {}),
      refreshJobs().catch(() => {}),
    ]);
  }

  async function refreshEngineStatus() {
    const infoEl = document.getElementById('transcribeEngineInfo');
    const badgeEl = document.getElementById('transcribeEngineBadge');
    if (!infoEl || !badgeEl) return;

    const res = await window.api.transcribeCheck();
    if (res?.ok) {
      badgeEl.dataset.state = 'done';
      badgeEl.textContent = 'Disponível';
      const model = res.whisperCpp?.available ? `whisper.cpp (${res.whisperCpp.binPath})` : res.engine;
      infoEl.textContent = `Engine: ${model}`;
    } else {
      badgeEl.dataset.state = 'error';
      badgeEl.textContent = 'Indisponível';
      infoEl.textContent = res?.reason || 'Nenhum engine de transcrição encontrado.';
    }
  }

  async function refreshJobs() {
    const res = await window.api.transcribeJobList();
    if (!res?.ok) return;
    jobs.clear();
    for (const job of res.jobs || []) jobs.set(job.jobId, job);
    jobList.renderList(jobs);
  }

  // ------------------------------------------------------- nova transcrição

  async function startTranscription() {
    const hintEl = document.getElementById('transcribeNewHint');
    const setHint = (text, ok = true) => {
      if (!hintEl) return;
      hintEl.hidden = !text;
      hintEl.textContent = text || '';
      hintEl.style.color = ok ? '' : 'var(--danger)';
    };

    const formats = [];
    if (document.getElementById('transcribeFmtTxt')?.checked) formats.push('txt');
    if (document.getElementById('transcribeFmtMd')?.checked) formats.push('md');
    if (document.getElementById('transcribeFmtSrt')?.checked) formats.push('srt');
    if (formats.length === 0) {
      setHint('Selecione ao menos um formato de saída (.txt, .md ou .srt).', false);
      return;
    }

    const model = modelSection.getSelectedModel();
    if (!modelSection.isModelInstalled(model)) {
      setHint('O modelo selecionado ainda não foi baixado. Baixe-o na lista de modelos antes de transcrever.', false);
      return;
    }

    const videoPath = await window.api.pickMediaFile();
    if (!videoPath) return; // usuário cancelou o diálogo

    const language = document.getElementById('transcribeLanguage')?.value || 'pt';
    setHint('Enfileirando transcrição...');

    const res = await window.api.transcribeStart({ videoPath, language, formats, model });
    if (!res?.ok) {
      setHint(res?.error?.message || 'Falha ao iniciar a transcrição.', false);
      return;
    }

    setHint('');
    if (res.job) jobs.set(res.job.jobId, res.job);
    jobList.renderList(jobs);
  }

  // -------------------------------------------------------------- jobs

  async function handleJobAction(action, target) {
    try {
      if (action === 'cancel' || action === 'retry' || action === 'remove') {
        const apiFn = {
          cancel: window.api.transcribeCancel,
          retry: window.api.transcribeRetry,
          remove: window.api.transcribeRemove,
        }[action];
        await apiFn(target.jobId);
      }
      if (action === 'reveal' && target.files?.[0]?.path) {
        await window.api.showInFolder({ filePath: target.files[0].path });
      }
      if (action === 'open-file' && target.path) {
        // 'open-file' recebe o objeto file ({ path, format, size }).
        await window.api.openFile({ filePath: target.path });
      }
    } catch {
      /* ações são best-effort; a lista é revalidada abaixo */
    }
    setTimeout(() => refreshJobs().catch(() => {}), 300);
  }

  /** Recebe eventos broadcast do main process. */
  function handleTranscribeEvent(channel, data) {
    switch (channel) {
      case 'progress': {
        const job = jobs.get(data?.jobId);
        if (job) {
          job.stage = data.stage || job.stage;
          if (typeof data.percent === 'number') job.percent = data.percent;
          if (!jobList.updateJobItemDom(job)) jobList.renderList(jobs);
        }
        break;
      }
      case 'log':
        break; // silencioso — logs ficam no terminal/main
      case 'done':
      case 'error':
      case 'job-updated':
        if (data?.jobId) {
          jobs.set(data.jobId, { ...jobs.get(data.jobId), ...data });
          jobList.renderList(jobs);
        }
        break;
      case 'removed':
        if (data?.jobId) {
          jobs.delete(data.jobId);
          jobList.renderList(jobs);
        }
        break;
      case 'model-progress':
        modelSection.renderModelProgress(data);
        break;
    }
  }

  return { refreshTranscribePanel, handleTranscribeEvent };
}
