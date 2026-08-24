import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createAdaptiveController,
  normalizeAdaptiveControllerOptions,
  ADAPTIVE_CONTROLLER_DEFAULTS,
} from '../../src/transports/adaptive-controller.js';

const win = (totalBytesPerSec, active, { elapsedMs = 1000, errors = 0 } = {}) => ({
  bytes: Math.round(totalBytesPerSec * (elapsedMs / 1000)),
  elapsedMs,
  errors,
  concurrency: active,
});

test('adaptive-controller: defaults e clamp de min/max/initial', () => {
  const t = createAdaptiveController();
  assert.equal(t.getConcurrency(), ADAPTIVE_CONTROLLER_DEFAULTS.initial);
  const cfg = t.config();
  assert.equal(cfg.min, 2);
  assert.equal(cfg.max, 12);

  const t2 = createAdaptiveController({ min: 4, max: 8, initial: 1 });
  assert.equal(t2.getConcurrency(), 4);
  const t3 = createAdaptiveController({ min: 4, max: 8, initial: 99 });
  assert.equal(t3.getConcurrency(), 8);
});

test('adaptive-controller: sobe na rampa inicial e reduz em throttling', () => {
  const t = createAdaptiveController({ windowMs: 1000 });
  t.sample(win(4 * 1024 * 1024, 2));
  t.sample(win(8 * 1024 * 1024, 2));
  t.sample(win(16 * 1024 * 1024, 4));
  t.sample(win(32 * 1024 * 1024, 8));
  assert.equal(t.getConcurrency(), 12);

  const d = t.sample(win(24 * 1024 * 1024, 12));
  assert.equal(d.action, 'down');
  assert.equal(d.reasonCode, 'throttling');
  assert.equal(t.getConcurrency(), 6);
});

test('adaptive-controller: normalize aceita boolean|objeto|null', () => {
  assert.equal(normalizeAdaptiveControllerOptions(false), null);
  assert.equal(normalizeAdaptiveControllerOptions(null), null);
  const a = normalizeAdaptiveControllerOptions(true);
  assert.equal(a.max, ADAPTIVE_CONTROLLER_DEFAULTS.max);
  const b = normalizeAdaptiveControllerOptions({ max: 6, windowMs: 500 });
  assert.equal(b.max, 6);
  assert.equal(b.windowMs, 500);
  assert.equal(b.min, ADAPTIVE_CONTROLLER_DEFAULTS.min);
});

test('adaptive-controller: 429 com Retry-After aumenta cooldown e expoe diagnostico', () => {
  const t = createAdaptiveController({ windowMs: 1000, cooldownWindows: 2, maxCooldownWindows: 10 });
  t.sample(win(4 * 1024 * 1024, 2));
  t.sample(win(8 * 1024 * 1024, 2));
  const d = t.sample({
    ...win(2 * 1024 * 1024, 4),
    rateLimitedErrors: 1,
    retryAfterMs: 4000,
    latencyMs: 800,
    requests: 4,
  });
  assert.equal(d.reasonCode, 'rate-limited');
  assert.equal(d.action, 'down');
  assert.ok(d.cooldown >= 4, `cooldown esperado >= 4, recebido ${d.cooldown}`);
  assert.equal(d.diagnostics.retryAfterMs, 4000);
  assert.equal(d.diagnostics.avgLatencyMs, 200);
});

test('adaptive-controller: timeout entra como backoff com reasonCode proprio', () => {
  const t = createAdaptiveController();
  t.sample(win(4 * 1024 * 1024, 2));
  t.sample(win(8 * 1024 * 1024, 2));
  const d = t.sample({
    ...win(4 * 1024 * 1024, 4),
    timeoutErrors: 2,
    latencyMs: 900,
    requests: 3,
    schedulerLimits: { downloadLimit: 8, hostLimit: 6, globalLimit: 12 },
  });
  assert.equal(d.reasonCode, 'timeout-backoff');
  assert.equal(d.action, 'down');
  assert.deepEqual(d.diagnostics.schedulerLimits, { downloadLimit: 8, hostLimit: 6, globalLimit: 12 });
});
