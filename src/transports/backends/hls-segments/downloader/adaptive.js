/**
 * Janela de amostragem do adaptive controller durante o download.
 */

import { resetWindow } from './state.js';

/**
 * Cria o coletor de decisões adaptativas.
 *
 * @param {Object} opts
 * @param {Object} opts.state - Estado compartilhado do downloader
 * @param {Function} opts.spawnAvailableWorkers - Sobe workers conforme `desired`
 * @param {Function} [opts.onProgress] - Callback de progresso
 * @param {Function} [opts.onAdaptiveDecision] - Callback de decisão adaptativa
 */
export function createAdaptiveWindow({
  state, spawnAvailableWorkers, onProgress, onAdaptiveDecision,
}) {
  const flush = () => {
    const { controller } = state;
    if (!controller) return;
    const elapsed = Date.now() - state.window.start;
    if (elapsed <= 0) return;

    const decision = controller.sample({
      bytes: state.window.bytes,
      elapsedMs: elapsed,
      errors: state.window.errors,
      concurrency: state.running,
      latencyMs: state.window.latencyMs,
      requests: state.window.requests,
      schedulerLimits: { downloadLimit: state.total, hostLimit: state.total, globalLimit: null },
    });
    resetWindow(state.window);
    state.desired = controller.getConcurrency();
    onAdaptiveDecision?.(decision);
    onProgress?.({
      done: state.done,
      total: state.total,
      totalBytes: state.totalBytes,
      failed: state.failed,
      concurrency: state.desired,
      adaptiveDecision: decision,
    });
    spawnAvailableWorkers();
  };

  const start = () => (state.controller
    ? setInterval(() => flush(), Math.max(50, state.controller.config().windowMs || 1200))
    : null);

  return { flush, start };
}
