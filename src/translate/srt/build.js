/**
 * Reconstrução de SRT a partir dos cues.
 *
 * Índices e linhas de tempo são copiados **byte a byte** do parse — só o texto
 * muda. `bom` e `eol` reproduzem o arquivo original.
 */

/**
 * Monta o SRT.
 *
 * Índices e linhas de tempo são copiados **byte a byte** do parse — só o texto
 * muda. `bom` e `eol` reproduzem o arquivo original. Quando o cue tem
 * `translatedLines` (saída do pipeline), é ela que vai para o arquivo; sem ela,
 * usa `lines` (round-trip fiel do original).
 *
 * @param {object} doc - Documento do `parseSrt`
 * @param {Array} doc.cues - Cues (com `lines` ou `translatedLines`)
 * @param {string} [doc.eol='\n'] - Separador de linha
 * @param {string} [doc.bom=''] - BOM a recolocar no início
 * @returns {string} Conteúdo SRT
 */
export function buildSrt({ cues = [], eol = '\n', bom = '' } = {}) {
  const blocks = cues.map((cue) => {
    const text = Array.isArray(cue.translatedLines) ? cue.translatedLines : cue.lines;
    return [String(cue.index), cue.timing, ...text].join(eol);
  });
  const body = blocks.length ? blocks.join(`${eol}${eol}`) + eol : '';
  return `${bom}${body}`;
}