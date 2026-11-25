/**
 * Medição de leitura (caracteres por segundo) e alvo de condensação.
 */

/**
 * Caracteres por segundo de um segmento.
 *
 * Duração zero ou negativa é tratada como 1 s para não dividir por zero.
 *
 * @param {object} cue
 * @param {string} cue.text - Texto do segmento
 * @param {number} cue.startMs
 * @param {number} cue.endMs
 * @returns {number} Caracteres por segundo
 */
export function charsPerSecondOf({ text = '', startMs = 0, endMs = 0 } = {}) {
  const durationMs = Math.max(1000, endMs - startMs);
  return text.length / (durationMs / 1000);
}

/**
 * Índices que continuam acima do alvo depois de traduzidos.
 *
 * Ignora índices sem tradução e devolve em ordem crescente.
 *
 * @param {Array} cues - Cues originais (com `startMs`/`endMs`)
 * @param {object} translated - Mapa índice → texto traduzido
 * @param {number} limit - Alvo de caracteres por segundo
 * @returns {number[]} Índices acima do alvo
 */
export function overTarget(cues, translated, limit) {
  const over = [];
  for (const cue of cues) {
    const text = translated?.[cue.index];
    if (typeof text !== 'string' || !text) continue;
    if (charsPerSecondOf({ text, startMs: cue.startMs, endMs: cue.endMs }) > limit) {
      over.push(cue.index);
    }
  }
  return over.sort((a, b) => a - b);
}