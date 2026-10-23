/**
 * P11 (secao 42 — UX de falhas): relatorio plano e serializavel para a UI.
 */

import { classifyError } from './classify.js';

/**
 * Classifica erros crus e normaliza instancias da taxonomia em
 * { message, suggestedAction, detail, code, retryable, status }.
 *
 * Uso: `electron/main.js` serializa via friendlyReport() antes do IPC; o CLI
 * renderiza "Motivo / Acao sugerida / [Detalhes]" a partir do mesmo objeto.
 */
export function friendlyReport(err) {
  const classified = classifyError(err);
  return {
    name: classified.name,
    message: classified.friendlyMessage || classified.message || String(err || 'erro desconhecido'),
    suggestedAction: classified.suggestedAction || '',
    detail: classified.detail || '',
    code: classified.code,
    retryable: classified.retryable,
    status: classified.status,
  };
}
