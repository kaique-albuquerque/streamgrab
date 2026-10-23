/** Tradução dos eventos broadcast do main process em updates de UI. */

export function createTranscribeEventHandler({ jobs, jobList, modelSection }) {
  return function handleTranscribeEvent(channel, data) {
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
  };
}
