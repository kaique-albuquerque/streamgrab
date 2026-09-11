/**
 * Rastreamento de métricas por job (speed, ETA, percent, totalBytes).
 */

const ACTIVE_STATES = new Set(['analyzing', 'preparing', 'downloading', 'merging']);

export function createMetricsTracker() {
  // jobId -> { speed, etaSeconds, percent, totalBytes }
  const jobMetrics = new Map();

  function handleQueueEvent(event, payload) {
    payload = payload || {};
    const jobId = payload.jobId;
    if (!jobId) return;

    const current = jobMetrics.get(jobId) || {};

    switch (event) {
      case 'start':
      case 'progress': {
        const percent = Number(payload.percent);
        const totalBytes = Number(payload.totalBytes) || current.totalBytes || 0;
        jobMetrics.set(jobId, {
          ...current,
          percent: Number.isFinite(percent) ? percent : current.percent,
          totalBytes,
        });
        break;
      }
      case 'speed':
        jobMetrics.set(jobId, { ...current, speed: Number(payload.speed) || 0 });
        break;
      case 'eta':
        jobMetrics.set(jobId, { ...current, etaSeconds: Number(payload.etaSeconds) || 0 });
        break;
      case 'complete':
      case 'error':
      case 'cancel':
        jobMetrics.delete(jobId);
        break;
      default:
        break;
    }
  }

  function getMetric(jobId, key) {
    const m = jobMetrics.get(jobId);
    if (m && m[key] != null) return m[key];
    return null;
  }

  function getPercent(job, getJobProgress) {
    const fromDash = getMetric(job.id, 'percent');
    if (fromDash != null) return fromDash;
    const fromTabs = getJobProgress ? getJobProgress(job.id) : null;
    if (fromTabs != null) return Number(fromTabs) || 0;
    return 0;
  }

  function clear() {
    jobMetrics.clear();
  }

  return { handleQueueEvent, getMetric, getPercent, clear, ACTIVE_STATES };
}
