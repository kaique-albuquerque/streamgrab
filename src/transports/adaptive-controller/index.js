/**
 * Adaptive concurrency controller extracted from Smart Turbo.
 *
 * This module is transport-agnostic: it only consumes window metrics and
 * returns concurrency decisions. Range keeps using it through the Smart Turbo
 * compatibility facade during the migration.
 */

import { resolveConfig } from './options.js';
import { evaluateWindow } from './rules.js';

export function createAdaptiveController(options = {}) {
  const cfg = resolveConfig(options);

  const state = {
    concurrency: cfg.initial,
    lastTotal: null,
    lastPerConn: null,
    cooldown: 0,
    samples: 0,
    growthStreak: 0,
    lastAction: 'hold',
    lastReason: 'inicial',
    lastReasonCode: 'initial',
  };

  function sample(metrics) {
    const decision = evaluateWindow(cfg, state, metrics);
    const { latencyMs = 0, requests = 0, errors = 0 } = metrics;
    const { rateLimitedErrors = 0, timeoutErrors = 0, retryAfterMs = 0, schedulerLimits = null } = metrics;
    const avgLatencyMs = requests > 0 ? latencyMs / requests : 0;

    return {
      concurrency: decision.concurrency,
      action: decision.action,
      reason: decision.reason,
      reasonCode: decision.reasonCode,
      total: decision.total,
      perConn: decision.perConn,
      samples: state.samples,
      cooldown: state.cooldown,
      diagnostics: {
        avgLatencyMs,
        latencyMs,
        requests,
        errors,
        rateLimitedErrors,
        timeoutErrors,
        retryAfterMs: retryAfterMs > 0 ? retryAfterMs : 0,
        schedulerLimits: schedulerLimits || null,
      },
    };
  }

  return {
    getConcurrency: () => state.concurrency,
    lastDecision: () => ({
      action: state.lastAction,
      reason: state.lastReason,
      reasonCode: state.lastReasonCode,
      samples: state.samples,
    }),
    reset: () => {
      state.concurrency = cfg.initial;
      state.lastTotal = null;
      state.lastPerConn = null;
      state.cooldown = 0;
      state.samples = 0;
      state.growthStreak = 0;
      state.lastAction = 'hold';
      state.lastReason = 'inicial';
      state.lastReasonCode = 'initial';
    },
    sample,
    config: () => ({ ...cfg }),
  };
}
