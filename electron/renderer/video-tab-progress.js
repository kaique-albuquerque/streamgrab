/**
 * Video Tab — Progresso e estados terminais do download.
 *
 * applyProgress: atualiza barra de progresso durante download.
 * finishTabDownload / failTabDownload / cancelTabDownload: resolvem estados finais.
 */

import {
  appendLog,
  formatBytes,
  lockTab,
  markAllPreviousAsDone,
  releaseOutput,
  setActiveStep,
  setStatus,
  syncMetrics,
} from './shared.js';
import { syncPreviewButton } from './video-tab-renderers.js';

export function applyProgress(tab, payload) {
  const pct = Number(payload.percent);
  if (Number.isFinite(pct) && pct > 0) {
    const capped = Math.min(99, pct);
    tab.fields.progress.style.width = `${capped}%`;
    tab.fields.percent.textContent = `${Math.floor(capped)}%`;
  }
  if (payload.bytesDownloaded != null) {
    tab.metrics.size = formatBytes(payload.bytesDownloaded);
    if (payload.totalBytes) tab.fields.progress.dataset.total = formatBytes(payload.totalBytes);
  } else if (payload.downloaded != null) {
    tab.metrics.size = formatBytes(payload.downloaded);
  }
  syncMetrics(tab);
  setActiveStep(tab, 'download');
  markAllPreviousAsDone(tab, 'download');
  if (payload.message) setStatus(tab, payload.message);
  else if (Number.isFinite(pct) && pct > 0) setStatus(tab, `Baixando... ${Math.floor(Math.min(99, pct))}%`);
  else setStatus(tab, 'Baixando...');
  if (payload.stage && payload.message) appendLog(tab, `[${payload.stage}] ${payload.message}`);
}

export function finishTabDownload(tab, payload, activeOutputs) {
  const output = payload.output || tab.outputPath;
  tab.outputPath = output;
  tab.jobState = 'terminal';
  releaseOutput(activeOutputs, tab.outputPath, tab.taskId);
  tab.panel.classList.remove('downloading');
  lockTab(tab, false);
  tab.fields.progress.style.width = '100%';
  tab.fields.percent.textContent = '100%';
  tab.fields.modeLabel.textContent = 'Download concluido';
  setStatus(tab, 'Download concluido!');
  if (output) tab.fields.resolvedOutput.textContent = output;
  appendLog(tab, `Download concluido! ${output}`);
  markAllPreviousAsDone(tab, 'download');
  if (output) tab.fields.revealRow.hidden = false;
  syncPreviewButton(tab);
}

export function failTabDownload(tab, payload, activeOutputs) {
  tab.jobState = 'terminal';
  releaseOutput(activeOutputs, tab.outputPath, tab.taskId);
  tab.panel.classList.remove('downloading');
  lockTab(tab, false);
  tab.fields.progress.style.width = '0%';
  tab.fields.percent.textContent = '0%';
  tab.fields.modeLabel.textContent = 'Falha no download';
  const message = payload.message || 'O download nao pode ser concluido.';
  setStatus(tab, `Falha: ${message}`);
  appendLog(tab, `ERRO: ${message}`);
  if (payload.suggestedAction) appendLog(tab, `Acao sugerida: ${payload.suggestedAction}`);
  if (payload.detail) appendLog(tab, `Detalhes: ${payload.detail}`);
  syncPreviewButton(tab);
}

export function cancelTabDownload(tab, payload, activeOutputs) {
  tab.jobState = 'terminal';
  releaseOutput(activeOutputs, tab.outputPath, tab.taskId);
  tab.panel.classList.remove('downloading');
  lockTab(tab, false);
  tab.fields.progress.style.width = '0%';
  tab.fields.percent.textContent = '0%';
  tab.fields.modeLabel.textContent = 'Cancelado';
  setStatus(tab, payload?.message || 'Download cancelado.');
  appendLog(tab, payload?.message || 'Download cancelado.');
  tab.fields.revealRow.hidden = true;
  syncPreviewButton(tab);
}
