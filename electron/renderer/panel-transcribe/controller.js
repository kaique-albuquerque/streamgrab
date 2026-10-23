/** Composição do painel de transcrição. */

import { createJobListRenderer } from '../panel-transcribe-jobs.js';
import { createModelSection } from '../panel-transcribe-model.js';
import { refreshEngineStatus } from './engine.js';
import { createJobsController } from './jobs.js';
import { createStartTranscription } from './start.js';
import { createTranscribeEventHandler } from './events.js';

export function createTranscribePanel() {
  /** jobId → snapshot do job (espelho do main). */
  const jobs = new Map();

  let wired = false;

  const modelSection = createModelSection();
  const jobList = createJobListRenderer({
    onJobAction: (action, target) => handleJobAction(action, target),
  });
  const { refreshJobs, handleJobAction } = createJobsController({ jobs, jobList });
  const startTranscription = createStartTranscription({ jobs, jobList, modelSection });
  const handleTranscribeEvent = createTranscribeEventHandler({ jobs, jobList, modelSection });

  function ensureWired() {
    if (wired) return;
    wired = true;

    document.getElementById('transcribeRefreshBtn')?.addEventListener('click', () => refreshTranscribePanel());
    document.getElementById('transcribeStartBtn')?.addEventListener('click', () => {
      startTranscription().catch(() => {});
    });
    modelSection.bind();
  }

  async function refreshTranscribePanel() {
    ensureWired();
    await Promise.all([
      refreshEngineStatus().catch(() => {}),
      modelSection.refreshModels().catch(() => {}),
      refreshJobs().catch(() => {}),
    ]);
  }

  return { refreshTranscribePanel, handleTranscribeEvent };
}
