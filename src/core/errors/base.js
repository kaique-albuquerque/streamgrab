/**
 * P2.2 — Base da taxonomia de erros.
 *
 * Secao 26 do architect.md: cada erro tem classe propria, mensagem amigavel
 * (para a UI), detalhe tecnico (para diagnostico) e retryability.
 */

import { redactText } from '../logger.js';

export const SYS_RETRYABLE_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
]);

export class StreamGrabError extends Error {
  constructor(message, { code = 'STREAMGRAB_ERROR', detail = '', retryable = false, status = 0, suggestedAction = '', cause } = {}) {
    const cleanMessage = typeof message === 'string' ? redactText(message) : message;
    super(cleanMessage);
    this.name = this.constructor.name;
    this.code = code;
    this.detail = typeof detail === 'string' ? redactText(detail) : detail;
    this.retryable = Boolean(retryable);
    this.status = Number(status) || 0;
    this.suggestedAction = typeof suggestedAction === 'string' ? redactText(suggestedAction) : suggestedAction;
    if (cause !== undefined) this.cause = cause;
  }

  /** Mensagem amigavel (para a UI). */
  get friendlyMessage() {
    return this.message;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      detail: this.detail,
      retryable: this.retryable,
      status: this.status,
      suggestedAction: this.suggestedAction,
    };
  }
}

export function defineErrorClass(name, { code, retryable = false, defaultMessage, suggestedAction }) {
  return class extends StreamGrabError {
    constructor(message = defaultMessage, options = {}) {
      super(message, { code, retryable, suggestedAction, ...options });
      this.name = name;
    }
  };
}
