/**
 * Circuit breaker for repeated platform errors (403/429) — Sprint 4.2.
 */

/**
 * Simple circuit breaker: opens after `threshold` consecutive failures,
 * stays open for `cooldownMs`, then transitions to half-open (allows one try).
 */
export class CircuitBreaker {
  /**
   * @param {object} [opts]
   * @param {number} [opts.threshold] — consecutive failures to open (default 3)
   * @param {number} [opts.cooldownMs] — ms to stay open (default 60 000)
   */
  constructor({ threshold = 3, cooldownMs = 60_000 } = {}) {
    this._failures = 0;
    this._threshold = threshold;
    this._cooldownMs = cooldownMs;
    this._openedAt = 0;
  }

  /** Returns true when the circuit is open (calls should be rejected). */
  isOpen() {
    if (this._failures < this._threshold) return false;
    if (Date.now() - this._openedAt > this._cooldownMs) {
      this._failures = 0; // half-open: allow one try
      return false;
    }
    return true;
  }

  recordFailure() {
    this._failures++;
    this._openedAt = Date.now();
  }

  recordSuccess() {
    this._failures = 0;
  }

  reset() {
    this._failures = 0;
    this._openedAt = 0;
  }
}

/** Global circuit breaker for yt-dlp analysis (platform 403/429). */
export const ytdlpAnalysisBreaker = new CircuitBreaker();
