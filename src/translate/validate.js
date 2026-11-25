/**
 * Validação das respostas do modelo por bloco.
 */

/** Erro: a resposta não trouxe todos os índices pedidos. */
export class MissingIndicesError extends Error {
  /**
   * @param {number[]} missing - Índices ausentes, em ordem crescente
   */
  constructor(missing) {
    super(`Resposta do modelo sem os índices: ${missing.join(', ')}`);
    this.name = 'MissingIndicesError';
    this.missing = missing;
  }
}

/**
 * Garante que a resposta traz todos os índices do bloco, com texto não-vazio.
 *
 * @param {Array} block - Cues do bloco
 * @param {object} response - Mapa índice → texto
 * @throws {MissingIndicesError} Quando falta algum índice
 */
export function assertAllIndices(block, response) {
  const missing = [];
  for (const cue of block) {
    const value = response?.[cue.index];
    if (typeof value !== 'string' || !value.trim()) missing.push(cue.index);
  }
  if (missing.length) {
    missing.sort((a, b) => a - b);
    throw new MissingIndicesError(missing);
  }
}