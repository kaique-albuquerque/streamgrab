/**
 * Blocos de detalhe de um item de job: progresso, erro e arquivos gerados.
 */

import { formatBytes } from '../shared.js';

/** Normaliza o percentual para o intervalo 0..100. */
export function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

/** Barra de progresso do job em execução. */
export function renderProgress(job) {
  const wrap = document.createElement('div');
  wrap.className = 'transcribe-progress';

  const bar = document.createElement('div');
  bar.className = 'transcribe-progress-bar';
  const fill = document.createElement('span');
  fill.style.width = `${clampPercent(job.percent)}%`;
  bar.appendChild(fill);

  const label = document.createElement('span');
  label.className = 'transcribe-progress-label';
  label.textContent = `${clampPercent(job.percent)}%`;

  wrap.append(bar, label);
  return wrap;
}

/** Mensagem de erro do job. */
export function renderError(job) {
  const err = document.createElement('div');
  err.className = 'transcribe-error-detail';
  err.textContent = job.error;
  return err;
}

/** Chips dos arquivos gerados; clicar abre o arquivo. */
export function renderFiles(job, onJobAction) {
  const wrap = document.createElement('div');
  wrap.className = 'transcribe-files';
  for (const file of job.files) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'transcribe-file-chip';
    chip.textContent = `${file.format.toUpperCase()} · ${formatBytes(file.size || 0)}`;
    chip.title = `Abrir ${file.path}`;
    chip.addEventListener('click', () => onJobAction?.('open-file', file));
    wrap.appendChild(chip);
  }
  return wrap;
}
