/** Lista de jobs: espelho do main + ações por item. */

export function createJobsController({ jobs, jobList }) {
  async function refreshJobs() {
    const res = await window.api.transcribeJobList();
    if (!res?.ok) return;
    jobs.clear();
    for (const job of res.jobs || []) jobs.set(job.jobId, job);
    jobList.renderList(jobs);
  }

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

  return { refreshJobs, handleJobAction };
}
