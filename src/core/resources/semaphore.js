/**
 * Semáforo com suporte a cancelamento via AbortSignal.
 */

/** Semafaro classico com suporte a cancelamento via AbortSignal. */
export class Semaphore {
  /**
   * @param {number} max — limite de recursos concorrentes (>= 1).
   */
  constructor(max = 1) {
    if (!Number.isFinite(max) || max < 1) {
      throw new TypeError(`Semaphore: max deve ser um inteiro >= 1 (recebido ${max})`);
    }
    this._max = Math.floor(max);
    this._active = 0;
    this._queue = [];
  }

  /** Quantos recursos estao em uso agora. */
  get active() {
    return this._active;
  }

  /** Quantos recursos ainda podem ser adquiridos sem esperar. */
  get available() {
    return Math.max(0, this._max - this._active);
  }

  get max() {
    return this._max;
  }

  /**
   * Adquire um slot. Resolve com uma funcao `release()`.
   * Se `signal` abortar enquanto espera na fila, rejeita com code CANCELLED.
   */
  acquire(signal) {
    if (this._active < this._max) {
      this._active += 1;
      return Promise.resolve(this._release.bind(this));
    }
    return new Promise((resolve, reject) => {
      const entry = { resolve, signal };
      const onAbort = () => {
        const idx = this._queue.indexOf(entry);
        if (idx >= 0) {
          this._queue.splice(idx, 1);
          const err = new Error('Operacao cancelada aguardando recurso.');
          err.code = 'CANCELLED';
          reject(err);
        }
      };
      entry.onAbort = onAbort;
      this._queue.push(entry);
      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  _release() {
    this._active = Math.max(0, this._active - 1);
    const next = this._queue.shift();
    if (!next) return;
    this._active += 1;
    if (next.signal) {
      try {
        next.signal.removeEventListener('abort', next.onAbort);
      } catch {
        /* ignora */
      }
    }
    next.resolve?.(this._release.bind(this));
  }
}
