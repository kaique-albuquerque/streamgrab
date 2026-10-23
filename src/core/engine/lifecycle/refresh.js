/**
 * Renovação do plano de download quando o provider expira a URL.
 */

import { normalizePreparedDownload, isRefreshableFailure } from '../helpers.js';

/**
 * Tenta renovar o plano via `adapter.refresh`.
 *
 * Retorna o `prepared` atualizado, ou `null` quando não é possível renovar.
 */
export async function tryRefreshPlan({ engine, job, adapter, prepared, err, refreshCount }) {
  const canRefresh = typeof adapter?.refresh === 'function'
    && prepared?._downloadPlan?.capabilities?.refreshAccess
    && refreshCount < 1
    && isRefreshableFailure(err);
  if (!canRefresh) return null;

  const refreshedPlan = await adapter.refresh({
    reason: err.code === 'FORBIDDEN_ERROR' ? 'expired-url' : 'session-refresh',
    statusCode: err.status || 0, currentPlan: prepared._downloadPlan,
    progress: { refreshCount }, refreshAttempt: refreshCount + 1,
  });
  if (!refreshedPlan) return null;

  const next = normalizePreparedDownload(refreshedPlan);
  job._prepared = next;
  job._downloadPlan = next?._downloadPlan || null;
  job.meta.totalBytes = Number(next.totalBytes || job.meta.totalBytes || 0);
  job.meta.durationMs = Number(next.durationMs || job.meta.durationMs || 0);
  engine._emit('log', {
    jobId: job.id,
    message: `[refresh] plano renovado pelo provider ${adapter.id} (tentativa ${refreshCount + 1})`,
  });
  return next;
}
