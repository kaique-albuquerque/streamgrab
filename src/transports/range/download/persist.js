/** Persistencia incremental do state de resume e tracker de progresso. */

import { saveState } from '../../../core/resume.js';

/**
 * Encadeia as gravacoes do state para evitar concorrencia entre workers.
 * Retorna `null` quando o resume esta desligado.
 */
export function createResumeContext({ sp, state, resume }) {
  if (!resume) return null;
  let chain = Promise.resolve();
  const persistState = () => {
    chain = chain.then(() => saveState(sp, state)).catch(() => {});
    return chain;
  };
  return { resume, state, persistState };
}

/** Contador compartilhado de bytes baixados entre os workers. */
export function createTracker({ downloaded, started, onProgress }) {
  return { downloaded, started, onProgress };
}
