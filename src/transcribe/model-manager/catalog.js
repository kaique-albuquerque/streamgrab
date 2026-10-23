/**
 * Catálogo de modelos GGML multilíngues suportados.
 *
 * Este é o único lugar do app com nome de arquivo, tamanho e SHA-256 de cada
 * modelo — whisper-cpp.js importa daqui.
 */

export const DEFAULT_MODEL = 'small';

const BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

/**
 * Catálogo de modelos multilíngues suportados.
 *
 * - expectedSize/sha256: valores oficiais de ggerganov/whisper.cpp.
 * - minSize: piso de integridade (~90% do tamanho esperado).
 * - heavy: modelos grandes o bastante para merecer aviso na UI.
 * - note: resumo para o usuário (velocidade x precisão).
 *
 * O objeto é mutável de propósito: os testes trocam os tamanhos por valores
 * minúsculos para não baixar centenas de MB em disco.
 */
export const MODEL_CATALOG = {
  tiny: {
    fileName: 'ggml-tiny.bin',
    label: 'tiny',
    expectedSize: 77_691_713,
    minSize: 77_691_713 * 0.9,
    sha256: 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21',
    url: `${BASE_URL}/ggml-tiny.bin`,
    note: '~74 MB. O mais rápido; precisão baixa — bom para rascunhos.',
    heavy: false,
  },
  base: {
    fileName: 'ggml-base.bin',
    label: 'base',
    expectedSize: 147_951_465,
    minSize: 147_951_465 * 0.9,
    sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe',
    url: `${BASE_URL}/ggml-base.bin`,
    note: '~141 MB. Um pouco melhor que o tiny e ainda muito rápido.',
    heavy: false,
  },
  small: {
    fileName: 'ggml-small.bin',
    label: 'small',
    expectedSize: 487_601_967,
    minSize: 487_601_967 * 0.9,
    sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b',
    url: `${BASE_URL}/ggml-small.bin`,
    note: '~465 MB. Equilíbrio entre qualidade e velocidade (recomendado).',
    heavy: false,
  },
  medium: {
    fileName: 'ggml-medium.bin',
    label: 'medium',
    expectedSize: 1_533_763_059,
    minSize: 1_533_763_059 * 0.9,
    sha256: '6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208',
    url: `${BASE_URL}/ggml-medium.bin`,
    note: '~1,4 GB. Bem mais preciso; usa ~5 GB de RAM e é bem mais lento.',
    heavy: true,
  },
  'large-v3': {
    fileName: 'ggml-large-v3.bin',
    label: 'large-v3',
    expectedSize: 3_095_033_483,
    minSize: 3_095_033_483 * 0.9,
    sha256: '64d182b440b98d5203c4f9bd541544d84c605196c4f7b845dfa11fb23594d1e2',
    url: `${BASE_URL}/ggml-large-v3.bin`,
    note: '~2,9 GB. Melhor precisão; exige ~10 GB de RAM e máquina forte.',
    heavy: true,
  },
};

/** Ids do catálogo, na ordem de exibição (menor → maior). */
export function listModelIds() {
  return Object.keys(MODEL_CATALOG);
}

/**
 * O modelo existe no catálogo?
 *
 * Usa `hasOwnProperty` de propósito: um id como 'constructor' ou '__proto__'
 * não deve herdar nada de Object.prototype.
 */
export function isKnownModel(model) {
  return typeof model === 'string' && Object.prototype.hasOwnProperty.call(MODEL_CATALOG, model);
}

/**
 * Entrada do catálogo para um id, ou null se desconhecido.
 *
 * Use esta função em vez de indexar MODEL_CATALOG direto, para nunca
 * resolver propriedades herdadas de Object.prototype.
 */
export function getModelEntry(model) {
  return isKnownModel(model) ? MODEL_CATALOG[model] : null;
}

/** Erro padrão para ids fora do catálogo. */
export function unknownModelError(model) {
  return new Error(`Modelo desconhecido: ${model}. Opções: ${listModelIds().join(', ')}`);
}
