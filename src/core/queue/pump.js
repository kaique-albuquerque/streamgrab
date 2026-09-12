/**
 * DownloadQueue — pump logic: picks queued jobs and dispatches to engine.
 *
 * Extracted from queue.js to keep each file under 200 lines. The pump is a
 * closure that captures a shared `ctx` bag instead of the full queue.
 */

/**
 * Extrai opcoes por-job do meta, montando o runOpts para engine.run().
 */
export function extractRunOptions(job) {
  return {
    destination: job.meta?.destination || undefined,
    selectedUrl: job.meta?.selectedUrl || undefined,
    headers: job.meta?.headers || undefined,
    auth: job.meta?.auth || undefined,
    mode: job.meta?.mode || undefined,
    // P12.1: audio/subtitle selections from meta
    audioLanguage: job.meta?.audioLanguage || undefined,
    allAudio: job.meta?.allAudio || false,
    subtitleLanguages: job.meta?.subtitleLanguages || [],
    embedSubs: job.meta?.embedSubs || false,
    turbo: job.meta?.turbo || false,
    turboChunks: job.meta?.turboChunks || undefined,
  };
}

/**
 * Cria a funcao _pump para uma instancia de fila.
 *
 * O `ctx` e compartilhado entre o pump e a factory:
 *  - engine, _order, _started, _running: estrutura da fila
 *  - _draining, _pumpScheduled: flags de controle
 *  - _paused, maxConcurrent: limites
 *  - orderedJobs: funcao que retorna jobs na ordem correta
 *  - emit: callback de eventos
 */
export function createPump(ctx) {
  /** Inicia o proximo job `queued` na ordem, respeitando o limite. */
  async function _pump() {
    // P1.4: usa queueMicrotask para evitar race condition — chamadas
    // concurrentes sao coalescidas em um unico pump na proxima microtask.
    if (ctx._pumpScheduled) return;
    ctx._pumpScheduled = true;
    queueMicrotask(async () => {
      ctx._pumpScheduled = false;
      if (ctx._draining) return;
      ctx._draining = true;
      try {
        while (!ctx._paused && ctx._running.size < ctx.maxConcurrent) {
          const job = ctx.orderedJobs().find(
            (j) => j.state === 'queued' && !ctx._started.has(j.id)
          );
          if (!job) break;
          ctx._started.add(job.id);
          const runOpts = extractRunOptions(job);
          const p = ctx.engine
            .run(job.id, runOpts)
            .catch(() => {}) // estado terminal ja registrado via eventos
            .finally(() => ctx._running.delete(job.id));
          ctx._running.set(job.id, p);
          ctx.emit('started', job);
        }
      } finally {
        ctx._draining = false;
      }
    });
  }

  return _pump;
}
