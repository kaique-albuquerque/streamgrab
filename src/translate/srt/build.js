/**
 * Reconstrução de SRT a partir dos cues.
 *
 * Índices e linhas de tempo são copiados **byte a byte** do parse — só o texto
 * muda. `bom` e `eol` reproduzem o arquivo original.
 */

/**
 * Monta o SRT.
 *
 * @param {object} doc - Documento do `parseSrt`
 * @param {Array} doc.cues - Cues (com `lines` já traduzidas)
 * @param {string} [doc.eol='\n'] - Separador de linha
 * @param {string} [doc.bom=''] - BOM a recolocar no início
 * @returns {string} Conteúdo SRT
 */
export function buildSrt({ cues = [], eol = '\n', bom = '' } = {}) {
  const blocks = cues.map((cue) => [String(cue.index), cue.timing, ...cue.lines].join(eol));
  const body = blocks.length ? blocks.join(`${eol}${eol}`) + eol : '';
  return `${bom}${body}`;
}