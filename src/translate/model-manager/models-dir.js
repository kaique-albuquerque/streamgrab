/**
 * Diretório gravável dos modelos GGUF de tradução.
 *
 * Mesmo contrato do de transcrição: o resolvedor é registrado pelo app
 * (userData/translate/models) e devolve `''` quando ninguém registrou — nesse
 * caso só o diretório do motor conta.
 */

/** Origem do diretório gravável (função, ou null para limpar). */
let modelsDirResolver = null;

/** Registra a origem do diretório gravável de modelos (função, ou null). */
export function setTranslateModelsDirResolver(resolver) {
  modelsDirResolver = typeof resolver === 'function' ? resolver : null;
}

/** Diretório gravável dos modelos de tradução ('' quando não registrado). */
export function getTranslateModelsDir() {
  try {
    return modelsDirResolver?.() || '';
  } catch {
    return '';
  }
}