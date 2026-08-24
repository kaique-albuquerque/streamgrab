/**
 * Adaptive concurrency controller extracted from Smart Turbo.
 *
 * This module is transport-agnostic: it only consumes window metrics and
 * returns concurrency decisions. Range keeps using it through the Smart Turbo
 * compatibility facade during the migration.
 */

export const ADAPTIVE_CONTROLLER_DEFAULTS = {
  min: 2,
  max: 12,
  initial: 2,
  windowMs: 1200,
  perConnDropRatio: 0.3,
  totalGainRatio: 0.05,
  backoffFactor: 0.5,
  cooldownWindows: 3,
  rampUpSamples: 3,
  maxCooldownWindows: 12,
};

function clampInt(value, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function createAdaptiveController(options = {}) {
  const cfg = { ...ADAPTIVE_CONTROLLER_DEFAULTS, ...options };
  cfg.min = clampInt(cfg.min, 1, 64);
  cfg.max = clampInt(cfg.max, cfg.min, 64);
  cfg.initial = clampInt(cfg.initial, cfg.min, cfg.max);

  let concurrency = cfg.initial;
  let lastTotal = null;
  let lastPerConn = null;
  let cooldown = 0;
  let samples = 0;
  let growthStreak = 0;
  let lastAction = 'hold';
  let lastReason = 'inicial';
  let lastReasonCode = 'initial';

  const normalize = (n) => Math.max(cfg.min, Math.min(cfg.max, Math.round(n)));

  function sample({
    bytes,
    elapsedMs,
    errors = 0,
    concurrency: active,
    latencyMs = 0,
    requests = 0,
    rateLimitedErrors = 0,
    timeoutErrors = 0,
    retryAfterMs = 0,
    schedulerLimits = null,
  }) {
    const total = elapsedMs > 0 ? bytes / (elapsedMs / 1000) : 0;
    const perConn = active && active > 0 ? total / active : concurrency > 0 ? total / concurrency : 0;
    const avgLatencyMs = requests > 0 ? latencyMs / requests : 0;
    const effectiveErrors = Math.max(0, errors) + Math.max(0, timeoutErrors);
    samples++;
    let action = 'hold';
    let reason = 'janela estavel; mantendo concurrency';
    let reasonCode = 'steady';

    if (rateLimitedErrors > 0 || retryAfterMs > 0) {
      const next = normalize(Math.ceil(concurrency * cfg.backoffFactor));
      if (next < concurrency) {
        concurrency = next;
        action = 'down';
      }
      const retryAfterWindows = retryAfterMs > 0 && cfg.windowMs > 0 ? Math.ceil(retryAfterMs / cfg.windowMs) : 0;
      cooldown = Math.min(cfg.maxCooldownWindows, Math.max(cfg.cooldownWindows, retryAfterWindows));
      reasonCode = 'rate-limited';
      reason =
        retryAfterMs > 0
          ? `${Math.max(1, rateLimitedErrors)} erro(s) 429 na janela -> backoff para ${concurrency} com Retry-After`
          : `${Math.max(1, rateLimitedErrors)} erro(s) 429 na janela -> backoff para ${concurrency}`;
    } else if (effectiveErrors > 0) {
      const next = normalize(Math.ceil(concurrency * cfg.backoffFactor));
      if (next < concurrency) {
        concurrency = next;
        action = 'down';
      }
      cooldown = cfg.cooldownWindows;
      reasonCode = timeoutErrors > 0 ? 'timeout-backoff' : 'retryable-error';
      reason =
        timeoutErrors > 0
          ? `${timeoutErrors} timeout(s) na janela -> backoff para ${concurrency}`
          : `${errors} erro(s) retryable na janela -> backoff para ${concurrency}`;
    } else if (total === 0 && lastTotal != null) {
      reason = 'janela sem dados (aguardando servidor); mantendo';
      reasonCode = 'idle-window';
    } else if (samples > 1 && lastPerConn != null && perConn < lastPerConn * (1 - cfg.perConnDropRatio)) {
      const dropPct = Math.round((1 - perConn / lastPerConn) * 100);
      const next = normalize(Math.ceil(concurrency * cfg.backoffFactor));
      if (next < concurrency) {
        concurrency = next;
        action = 'down';
      }
      cooldown = cfg.cooldownWindows;
      reasonCode = 'throttling';
      reason = `throttling: por-conexao caiu ${dropPct}% -> backoff para ${concurrency}`;
    } else if (cooldown > 0) {
      cooldown--;
      reasonCode = 'cooldown';
      reason = `cooldown (${cooldown} janelas restantes)`;
    } else if (concurrency < cfg.max) {
      const totalGrew = lastTotal != null && total > lastTotal * (1 + cfg.totalGainRatio);
      growthStreak = totalGrew ? growthStreak + 1 : 0;
      const ramp = samples > 1 && samples <= cfg.rampUpSamples + 1;
      if (ramp || (totalGrew && growthStreak >= 2)) {
        const next = normalize(Math.min(cfg.max, concurrency * 2));
        if (next > concurrency) {
          concurrency = next;
          action = 'up';
        }
        reasonCode = ramp ? 'ramp-up' : 'growth-up';
        reason = ramp ? `rampa inicial (${samples}/${cfg.rampUpSamples})` : 'total cresceu; escalando';
      } else {
        reasonCode = 'plateau-hold';
        reason = 'total estagnou; estabilizando';
      }
    } else {
      reasonCode = 'max-limit';
      reason = 'no limite maximo';
    }

    lastTotal = total > 0 ? total : lastTotal;
    lastPerConn = perConn > 0 ? perConn : lastPerConn;
    lastAction = action;
    lastReason = reason;
    lastReasonCode = reasonCode;
    return {
      concurrency,
      action,
      reason,
      reasonCode,
      total,
      perConn,
      samples,
      cooldown,
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
    getConcurrency: () => concurrency,
    lastDecision: () => ({ action: lastAction, reason: lastReason, reasonCode: lastReasonCode, samples }),
    reset: () => {
      concurrency = cfg.initial;
      lastTotal = null;
      lastPerConn = null;
      cooldown = 0;
      samples = 0;
      growthStreak = 0;
      lastAction = 'hold';
      lastReason = 'inicial';
      lastReasonCode = 'initial';
    },
    sample,
    config: () => ({ ...cfg }),
  };
}

export function normalizeAdaptiveControllerOptions(value) {
  if (!value) return null;
  const opts = typeof value === 'object' && value ? value : {};
  return { ...ADAPTIVE_CONTROLLER_DEFAULTS, ...opts };
}

export default {
  ADAPTIVE_CONTROLLER_DEFAULTS,
  createAdaptiveController,
  normalizeAdaptiveControllerOptions,
};
