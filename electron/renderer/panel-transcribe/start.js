/** Enfileiramento de uma nova transcrição (formato, modelo, arquivo). */

export function createStartTranscription({ jobs, jobList, modelSection }) {
  return async function startTranscription() {
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
  };
}
