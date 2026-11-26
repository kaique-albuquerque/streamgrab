/**
 * Ações do card de tradução: enfileirar e baixar modelo.
 */

import { TRANSLATE_STATE_LABELS } from '../panel-constants.js';

/** Cria as ações do painel de tradução. */
export function createTranslateActions({ api, doc, jobs, renderList }) {
  function hint(text, isError = false) {
    const el = doc.getElementById('translateNewHint');
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
    el.style.color = isError ? 'var(--danger)' : '';
  }

  async function start() {
    const model = doc.getElementById('translateModelSelect')?.value || 'qwen3-4b';
    const srtPath = await api().pickSubtitleFile();
    if (!srtPath) return;

    hint('Enfileirando tradução...');
    const res = await api().translateStart({ srtPath, model, targetLang: 'pt' });
    if (!res?.ok) {
      hint(res?.error?.message || 'Falha ao iniciar a tradução.', true);
      return;
    }
    hint('');
    if (res.job && !jobs.has(res.job.jobId)) jobs.set(res.job.jobId, res.job);
    renderList();
  }

  async function downloadModel() {
    const model = doc.getElementById('translateModelSelect')?.value || 'qwen3-4b';
    hint(`Baixando "${model}"...`);
    const res = await api().translateModelDownload({ model });
    if (res?.cancelled) hint('Download cancelado. O progresso parcial foi mantido.');
    else if (!res?.ok) hint(res?.error?.message || 'Falha no download do modelo.', true);
    else hint('');
  }

  async function deleteModel() {
    const model = doc.getElementById('translateModelSelect')?.value || 'qwen3-4b';
    const res = await api().translateModelDelete({ model });
    if (!res?.ok) {
      hint(res?.error?.message || 'Falha ao excluir o modelo.', true);
      return;
    }
    hint(`Modelo "${model}" excluído.`);
  }

  return { start, downloadModel, deleteModel, hint, labels: TRANSLATE_STATE_LABELS };
}