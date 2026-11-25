/**
 * Agrupamento de cues em blocos com contexto para o LLM.
 */

/** Tamanho padrão do bloco (cues por chamada). */
export const BLOCK_SIZE = 30;

/**
 * Agrupa cues em blocos de `size` sem sobreposição e sem perder nenhum.
 *
 * @param {Array} cues - Cues do `parseSrt`
 * @param {number} [size=BLOCK_SIZE] - Cues por bloco
 * @returns {Array<Array>} Blocos
 */
export function toBlocks(cues, size = BLOCK_SIZE) {
  const blocks = [];
  for (let i = 0; i < cues.length; i += size) {
    blocks.push(cues.slice(i, i + size));
  }
  return blocks;
}