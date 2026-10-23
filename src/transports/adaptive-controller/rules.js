/**
 * Regras de decisão do adaptive controller: consumo de métricas de janela e
 * cálculo da próxima concurrency (backoff, cooldown, rampa e crescimento).
 */

const normalizeWith = (cfg, n) => Math.max(cfg.min, Math.min(cfg.max, Math.round(n)));

/**
 * Avalia uma janela de métricas, mutando `state` (concurrency, cooldown,
 * samples, growthStreak) e retornando a decisão.
 *
 * @returns {{concurrency: number, action: string, reason: string, reasonCode: string, total: number, perConn: number}}
 */
export function evaluateWindow(cfg, state, metrics) {
  const {
    bytes,
    elapsedMs,
    errors = 0,
    concurrency: active,
    rateLimitedErrors = 0,
    timeoutErrors = 0,
    retryAfterMs = 0,
  } = metrics;

  const total = elapsedMs > 0 ? bytes / (elapsedMs / 1000) : 0;
  const perConn = active && active > 0
    ? total / active
    : state.concurrency > 0 ? total / state.concurrency : 0;
  const effectiveErrors = Math.max(0, errors) + Math.max(0, timeoutErrors);
  state.samples++;
  let action = 'hold';
  let reason = 'janela estavel; mantendo concurrency';
  let reasonCode = 'steady';

  const backoff = () => {
    const next = normalizeWith(cfg, Math.ceil(state.concurrency * cfg.backoffFactor));
    if (next < state.concurrency) {
      state.concurrency = next;
      action = 'down';
    }
  };

  if (rateLimitedErrors > 0 || retryAfterMs > 0) {
    backoff();
    const retryAfterWindows = retryAfterMs > 0 && cfg.windowMs > 0 ? Math.ceil(retryAfterMs / cfg.windowMs) : 0;
    state.cooldown = Math.min(cfg.maxCooldownWindows, Math.max(cfg.cooldownWindows, retryAfterWindows));
    reasonCode = 'rate-limited';
    reason = retryAfterMs > 0
      ? `${Math.max(1, rateLimitedErrors)} erro(s) 429 na janela -> backoff para ${state.concurrency} com Retry-After`
      : `${Math.max(1, rateLimitedErrors)} erro(s) 429 na janela -> backoff para ${state.concurrency}`;
  } else if (effectiveErrors > 0) {
    backoff();
    state.cooldown = cfg.cooldownWindows;
    reasonCode = timeoutErrors > 0 ? 'timeout-backoff' : 'retryable-error';
    reason = timeoutErrors > 0
      ? `${timeoutErrors} timeout(s) na janela -> backoff para ${state.concurrency}`
      : `${errors} erro(s) retryable na janela -> backoff para ${state.concurrency}`;
  } else if (total === 0 && state.lastTotal != null) {
    reason = 'janela sem dados (aguardando servidor); mantendo';
    reasonCode = 'idle-window';
  } else if (
    state.samples > 1
    && state.lastPerConn != null
    && perConn < state.lastPerConn * (1 - cfg.perConnDropRatio)
  ) {
    const dropPct = Math.round((1 - perConn / state.lastPerConn) * 100);
    backoff();
    state.cooldown = cfg.cooldownWindows;
    reasonCode = 'throttling';
    reason = `throttling: por-conexao caiu ${dropPct}% -> backoff para ${state.concurrency}`;
  } else if (state.cooldown > 0) {
    state.cooldown--;
    reasonCode = 'cooldown';
    reason = `cooldown (${state.cooldown} janelas restantes)`;
  } else if (state.concurrency < cfg.max) {
    const totalGrew = state.lastTotal != null && total > state.lastTotal * (1 + cfg.totalGainRatio);
    state.growthStreak = totalGrew ? state.growthStreak + 1 : 0;
    const ramp = state.samples > 1 && state.samples <= cfg.rampUpSamples + 1;
    if (ramp || (totalGrew && state.growthStreak >= 2)) {
      const next = normalizeWith(cfg, Math.min(cfg.max, state.concurrency * 2));
      if (next > state.concurrency) {
        state.concurrency = next;
        action = 'up';
      }
      reasonCode = ramp ? 'ramp-up' : 'growth-up';
      reason = ramp
        ? `rampa inicial (${state.samples}/${cfg.rampUpSamples})`
        : 'total cresceu; escalando';
    } else {
      reasonCode = 'plateau-hold';
      reason = 'total estagnou; estabilizando';
    }
  } else {
    reasonCode = 'max-limit';
    reason = 'no limite maximo';
  }

  state.lastTotal = total > 0 ? total : state.lastTotal;
  state.lastPerConn = perConn > 0 ? perConn : state.lastPerConn;
  state.lastAction = action;
  state.lastReason = reason;
  state.lastReasonCode = reasonCode;

  return {
    concurrency: state.concurrency, action, reason, reasonCode, total, perConn,
  };
}
