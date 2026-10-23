/** Defaults e normalização das opções do adaptive controller. */

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

/** Mescla as opções com os defaults e aplica os limites de min/max/initial. */
export function resolveConfig(options = {}) {
  const cfg = { ...ADAPTIVE_CONTROLLER_DEFAULTS, ...options };
  cfg.min = clampInt(cfg.min, 1, 64);
  cfg.max = clampInt(cfg.max, cfg.min, 64);
  cfg.initial = clampInt(cfg.initial, cfg.min, cfg.max);
  return cfg;
}

export function normalizeAdaptiveControllerOptions(value) {
  if (!value) return null;
  const opts = typeof value === 'object' && value ? value : {};
  return { ...ADAPTIVE_CONTROLLER_DEFAULTS, ...opts };
}
