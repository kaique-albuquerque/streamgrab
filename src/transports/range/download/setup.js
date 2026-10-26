/** Fase de decisao de resume + calculo dos ranges do transporte Range. */

import fs from 'node:fs';
import { defaultStatePath, loadState, clearState, completedBytes } from '../../../core/resume.js';
import { resolveResumeSession } from '../../../core/session.js';
import { probeRangeSupport, computeRanges, DEFAULT_RANGE_CHUNKS } from '../probe.js';

/**
 * Resolve a decisao de resume (P6.1), sonda o suporte a Range e calcula os
 * blocos a baixar. Pode substituir `url` quando a URL expirou.
 */
export async function prepareRangePlan({
  url, output, headers = {}, signal, timeoutMs = 0,
  chunkCount = DEFAULT_RANGE_CHUNKS, blockCount, concurrency,
  resume = true, statePath, onExpiredUrl, onResume,
} = {}) {
  const desiredConcurrency = Math.max(1, Math.floor(concurrency || chunkCount));
  const desiredBlockCount = Number.isInteger(blockCount) && blockCount > 0
    ? blockCount : Math.max(1, Math.floor(chunkCount || DEFAULT_RANGE_CHUNKS));
  const sp = statePath || defaultStatePath(output);

  let probe;
  let state = null;
  let ranges = [];
  let fileMode = 'w';
  let resumedBytes = 0;

  if (resume) {
    let probeError = null;
    try { probe = await probeRangeSupport(url, { headers, signal, timeoutMs }); } catch (err) { probeError = err; }
    const decision = await resolveResumeSession({
      state: loadState(sp), url, headers, probe, probeError,
      resolveFreshUrl: onExpiredUrl,
      probeRange: (u) => probeRangeSupport(u, { headers, signal, timeoutMs }),
      onReanalyze: (info) => onResume?.({ action: 'reanalyze', reason: info.reason, resumedBytes: 0 }),
    });
    if (decision.action === 'error') throw decision.error;
    url = decision.url || url;
    probe = decision.probe;

    if (decision.action === 'resume') {
      state = decision.state;
      ranges = state.chunks.filter((c) => !c.completed);
      resumedBytes = completedBytes(state);
      fileMode = 'r+';
      onResume?.({ action: 'resume', reason: decision.reason, resumedBytes });
      const st = await fs.promises.stat(output).catch(() => null);
      if (!st || st.size !== probe.total) {
        await clearState(sp);
        state = null;
        ranges = computeRanges(probe.total, desiredBlockCount);
        resumedBytes = 0;
        fileMode = 'w';
        onResume?.({ action: 'discard', reason: 'parcial ausente ou com tamanho divergente', resumedBytes: 0 });
      }
    } else {
      if (decision.state) await clearState(sp);
      ranges = computeRanges(probe.total, desiredBlockCount);
      onResume?.({ action: decision.action === 'discard' ? 'discard' : 'fresh', reason: decision.reason, resumedBytes: 0 });
    }
  } else {
    probe = await probeRangeSupport(url, { headers, signal, timeoutMs });
    ranges = computeRanges(probe.total, desiredBlockCount);
  }

  return {
    url, probe, total: probe.total, state, ranges, fileMode, resumedBytes, sp,
    desiredConcurrency, desiredBlockCount,
  };
}
