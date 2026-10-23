/**
 * Item da lista de jobs de transcrição.
 */

import { renderHead } from './head.js';
import { renderError, renderFiles, renderProgress } from './details.js';
import { renderActions } from './actions.js';

/** Monta o elemento completo de um job. */
export function renderJobItem(job, onJobAction) {
  const item = document.createElement('div');
  item.className = 'queue-item';
  item.dataset.jobId = job.jobId;
  item.appendChild(renderHead(job));

  if (job.status === 'running') item.appendChild(renderProgress(job));
  if (job.status === 'error' && job.error) item.appendChild(renderError(job));
  if (job.status === 'done' && Array.isArray(job.files) && job.files.length > 0) {
    item.appendChild(renderFiles(job, onJobAction));
  }

  const actions = renderActions(job, onJobAction);
  if (actions) item.appendChild(actions);
  return item;
}
