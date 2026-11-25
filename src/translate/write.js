/**
 * Escrita do arquivo de legenda traduzido.
 *
 * Saída: `<base>.pt.srt` no mesmo diretório da entrada. O arquivo de entrada
 * nunca é tocado. `eol` e `bom` reproduzem o original.
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildSrt } from './srt/build.js';

/**
 * Grava a legenda traduzida ao lado do original.
 *
 * @param {object} params
 * @param {string} params.srtPath - Caminho do `.srt` de entrada
 * @param {object} params.doc - Documento do `parseSrt` (com `cues` traduzidos)
 * @param {string} [params.targetLang='pt'] - Idioma de destino
 * @returns {{ outputPath: string, size: number }} Caminho e tamanho do arquivo
 */
export function writeTranslatedSrt({ srtPath, doc, targetLang = 'pt' }) {
  const dir = path.dirname(srtPath);
  const base = path.basename(srtPath, path.extname(srtPath));
  const outputPath = path.join(dir, `${base}.${targetLang}.srt`);

  const content = buildSrt({ cues: doc.cues, eol: doc.eol, bom: doc.bom });
  fs.writeFileSync(outputPath, content, 'utf8');

  return { outputPath, size: fs.statSync(outputPath).size };
}