/**
 * Catálogo de modelos GGUF suportados pela tradução local de legendas.
 *
 * Este é o único lugar do app com nome de arquivo, tamanho e SHA-256 de cada
 * modelo — `src/translate/model-manager.js` importa daqui.
 *
 * O objeto é mutável de propósito: os testes trocam tamanhos por valores
 * minúsculos para não baixar gigabytes em disco.
 */

export const DEFAULT_TRANSLATE_MODEL = 'qwen3-4b';

const BASE_URL = 'https://huggingface.co';

/**
 * Catálogo de modelos de tradução.
 *
 * - expectedSize/sha256: valores oficiais dos arquivos GGUF.
 * - minSize: piso de integridade (~90% do tamanho esperado).
 * - heavy: modelos grandes o bastante para merecer aviso na UI.
 * - note: resumo para o usuário (velocidade x qualidade).
 */
export const TRANSLATE_MODEL_CATALOG = {
  'qwen3-4b': {
    fileName: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    label: 'Qwen3-4B',
    expectedSize: 2_497_281_120,
    minSize: 2_497_281_120 * 0.9,
    sha256: '3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597',
    url: `${BASE_URL}/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf`,
    note: '~2,4 GB. Padrão: arquivo único, ~2x mais rápido em CPU.',
    heavy: false,
  },
  'qwen2.5-7b': {
    fileName: 'Qwen2.5-7B-Instruct-Q4_K_M.gguf',
    label: 'Qwen2.5-7B',
    expectedSize: 4_683_074_240,
    minSize: 4_683_074_240 * 0.9,
    sha256: '65b8fcd92af6b4fefa935c625d1ac27ea29dcb6ee14589c55a8f115ceaaa1423',
    url: `${BASE_URL}/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf`,
    note: '~4,5 GB. Mais natural, ~2x mais lento.',
    heavy: true,
  },
};

/** Ids do catálogo, na ordem de exibição. */
export function listTranslateModelIds() {
  return Object.keys(TRANSLATE_MODEL_CATALOG);
}

/**
 * O modelo existe no catálogo?
 *
 * Usa `hasOwnProperty` de propósito: um id como 'constructor' ou '__proto__'
 * não deve herdar nada de Object.prototype.
 */
export function isKnownTranslateModel(model) {
  return typeof model === 'string' && Object.prototype.hasOwnProperty.call(TRANSLATE_MODEL_CATALOG, model);
}

/**
 * Entrada do catálogo para um id, ou null se desconhecido.
 *
 * Use esta função em vez de indexar TRANSLATE_MODEL_CATALOG direto, para nunca
 * resolver propriedades herdadas de Object.prototype.
 */
export function getTranslateModelEntry(model) {
  return isKnownTranslateModel(model) ? TRANSLATE_MODEL_CATALOG[model] : null;
}

/** Erro padrão para ids fora do catálogo. */
export function unknownTranslateModelError(model) {
  return new Error(`Modelo de tradução desconhecido: ${model}. Opções: ${listTranslateModelIds().join(', ')}`);
}