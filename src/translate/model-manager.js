/**
 * Gerenciamento dos modelos GGUF de tradução.
 *
 * Espelha o `src/transcribe/model-manager.js`, mas com catálogo próprio
 * (`TRANSLATE_MODEL_CATALOG`) e diretório gravável próprio
 * (`userData/translate/models`). O download, a retomada por HTTP Range e a
 * verificação de SHA-256 são os mesmos do gerenciador de transcrição — este
 * módulo só delega, passando o catálogo.
 *
 * Uso:
 *   const status = getTranslateModelStatus('qwen3-4b');
 *   await downloadTranslateModel({ model: 'qwen3-4b', onProgress });
 */

import { deleteModel, downloadModel, getModelStatus, listModels } from '../transcribe/model-manager.js';
import {
  DEFAULT_TRANSLATE_MODEL,
  TRANSLATE_MODEL_CATALOG,
  getTranslateModelEntry,
  isKnownTranslateModel,
  listTranslateModelIds,
} from './model-manager/catalog.js';
import { getTranslateModelsDir, setTranslateModelsDirResolver } from './model-manager/models-dir.js';

export {
  DEFAULT_TRANSLATE_MODEL,
  TRANSLATE_MODEL_CATALOG,
  getTranslateModelEntry,
  isKnownTranslateModel,
  listTranslateModelIds,
  getTranslateModelsDir,
  setTranslateModelsDirResolver,
};

/**
 * Baixa um modelo de tradução com retomada e progresso.
 *
 * @param {object} params
 * @param {string} params.model - Chave do catálogo
 * @param {string} [params.modelsDir] - Sobrescreve o diretório gravável
 * @param {Function} [params.onProgress] - Callback de progresso
 * @param {AbortSignal} [params.signal] - Sinal de cancelamento
 * @param {typeof fetch} [params.fetchImpl] - fetch injetável (testes)
 */
export function downloadTranslateModel({
  model = DEFAULT_TRANSLATE_MODEL,
  modelsDir,
  onProgress,
  signal,
  fetchImpl,
} = {}) {
  return downloadModel({
    modelsDir: modelsDir || getTranslateModelsDir(),
    model,
    catalog: TRANSLATE_MODEL_CATALOG,
    onProgress,
    signal,
    fetchImpl,
  });
}

/**
 * Status de um modelo de tradução.
 *
 * @param {string} model - Chave do catálogo
 * @param {object} [options]
 * @param {string} [options.modelsDir] - Sobrescreve o diretório gravável
 */
export function getTranslateModelStatus(model = DEFAULT_TRANSLATE_MODEL, { modelsDir } = {}) {
  return getModelStatus(modelsDir || getTranslateModelsDir(), model, {
    catalog: TRANSLATE_MODEL_CATALOG,
  });
}

/** Status de todos os modelos de tradução, na ordem de exibição. */
export function listTranslateModels({ modelsDir } = {}) {
  return listModels(modelsDir || getTranslateModelsDir(), { catalog: TRANSLATE_MODEL_CATALOG });
}

/**
 * Exclui os arquivos de um modelo de tradução (modelo, `.part` e marcador).
 *
 * @param {string} modelsDir - Diretório gravável
 * @param {string} model - Chave do catálogo
 */
export function deleteTranslateModel(modelsDir, model) {
  return deleteModel(modelsDir || getTranslateModelsDir(), model, { catalog: TRANSLATE_MODEL_CATALOG });
}