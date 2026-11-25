/**
 * Parse de SRT preservando a linha de tempo original.
 *
 * Cada cue guarda `timing` (a linha `00:00:01,000 --> 00:00:02,500` intacta),
 * `startMs`/`endMs` (para medição) e `lines` (texto original, com marcação).
 * BOM e EOL são detectados e devolvidos para que o `build` reproduza o arquivo
 * byte a byte quando nada muda.
 */

/** Linha de tempo do SRT: `hh:mm:ss,mmm --> hh:mm:ss,mmm`. */
const TIMING_RE = /^(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})$/;

/** Converte ms para o total de milissegundos de um timestamp SRT. */
function toMs(h, m, s, ms) {
  return Number(h) * 3_600_000 + Number(m) * 60_000 + Number(s) * 1_000 + Number(ms);
}

/**
 * Faz o parse de um documento SRT.
 *
 * @param {string} text - Conteúdo bruto do arquivo
 * @returns {{ cues: Array<{index: number, timing: string, startMs: number, endMs: number, lines: string[]}>, eol: string, bom: string, skipped: number }}
 */
export function parseSrt(text) {
  const raw = typeof text === 'string' ? text : '';
  const bom = raw.startsWith('\uFEFF') ? '\uFEFF' : '';
  const body = bom ? raw.slice(1) : raw;

  // EOL de fato usado no arquivo (CRLF tem prioridade sobre LF).
  const eol = body.includes('\r\n') ? '\r\n' : '\n';
  const lines = body.split(/\r\n|\n/);

  const cues = [];
  let skipped = 0;
  let i = 0;

  while (i < lines.length) {
    const indexLine = lines[i].trim();
    if (!indexLine) {
      i++;
      continue;
    }

    const index = Number(indexLine);
    const timingLine = lines[i + 1] ?? '';
    const match = TIMING_RE.exec(timingLine.trim());

    if (!Number.isInteger(index) || index <= 0) {
      // Linha de texto solta (sem índice): não é um cue, não conta.
      i++;
      continue;
    }

    if (!match) {
      // Índice numérico sem linha de tempo válida: cue malformado.
      skipped++;
      i++;
      continue;
    }

    const [, h1, m1, s1, ms1, h2, m2, s2, ms2] = match;
    const cueLines = [];
    let j = i + 2;
    while (j < lines.length && lines[j].trim() !== '') {
      cueLines.push(lines[j]);
      j++;
    }

    cues.push({
      index,
      timing: timingLine,
      startMs: toMs(h1, m1, s1, ms1),
      endMs: toMs(h2, m2, s2, ms2),
      lines: cueLines,
    });

    i = j + 1;
  }

  return { cues, eol, bom, skipped };
}