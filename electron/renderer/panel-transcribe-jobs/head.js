/**
 * Cabeçalho de um item da lista de jobs de transcrição.
 */

import { TRANSCRIBE_STATE_LABELS, TRANSCRIBE_STAGE_LABELS } from '../panel-constants.js';

/** Linha secundária com idioma, formatos e estágio atual. */
export function describeJob(job) {
  const stageLabel = job.status === 'running' ? TRANSCRIBE_STAGE_LABELS[job.stage] || job.stage || '' : '';
  const formats = (job.formats || []).map((f) => `.${f}`).join(' ');
  return `${job.language || 'pt'} · ${formats}${stageLabel ? ` · ${stageLabel}` : ''}`;
}

/** Monta a linha de título/status do job. */
export function renderHead(job) {
  const head = document.createElement('div');
  head.className = 'queue-item-head';

  const titleWrap = document.createElement('div');
  titleWrap.style.minWidth = '0';
  const title = document.createElement('div');
  title.className = 'queue-item-title';
  title.textContent = job.videoPath?.split(/[\\/]/).pop() || job.videoPath || 'Vídeo';

  const sub = document.createElement('div');
  sub.className = 'queue-item-url';
  sub.textContent = describeJob(job);

  titleWrap.append(title, sub);

  const statePill = document.createElement('span');
  statePill.className = 'job-state';
  statePill.dataset.state = job.status || 'queued';
  statePill.textContent = TRANSCRIBE_STATE_LABELS[job.status] || job.status || '';

  head.append(titleWrap, statePill);
  return head;
}
