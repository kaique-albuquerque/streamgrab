/**
 * Gerenciamento dos modelos GGML do whisper.cpp para o app.
 *
 * Em produção o instalador traz apenas o binário whisper-cli
 * (scripts/package-resources.mjs). Os modelos (74 MB a 2,9 GB) são baixados
 * sob demanda para um diretório gravável (userData/whisper/models), pois o
 * diretório do instalador é read-only.
 *
 * Este módulo é a ÚNICA fonte de verdade do catálogo (nome do arquivo,
 * tamanho e SHA-256) — whisper-cpp.js importa daqui.
 *
 * Download com retomada (HTTP Range): um arquivo .part é mantido entre
 * tentativas e renomeado apenas após verificação de tamanho e SHA-256. Um
 * marcador <arquivo>.sha256 registra o hash já conferido, evitando reler
 * gigabytes a cada abertura do app.
 *
 * Uso:
 *   const status = getModelStatus(modelsDir, 'small');
 *   const todos = listModels(modelsDir);
 *   await downloadModel({ modelsDir, model: 'small', onProgress, signal });
 *
 * A implementação vive em `./model-manager/`, um arquivo por responsabilidade.
 */

export { DEFAULT_MODEL, MODEL_CATALOG, getModelEntry, isKnownModel, listModelIds } from './model-manager/catalog.js';
export { getModelsDir, modelSearchDirs, setModelsDirResolver } from './model-manager/models-dir.js';
export { deleteModel } from './model-manager/delete.js';
export { downloadModel, downloadModel as default } from './model-manager/download.js';
export {
  getModelStatus,
  getModelStatusFor,
  listModels,
  listModelsFor,
} from './model-manager/status.js';
