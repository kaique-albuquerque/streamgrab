/**
 * Leitura dos arquivos .txt/.srt gerados pelo whisper.cpp.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseSrt } from './output-parsing.js';

/**
 * Localiza os arquivos de saída no diretório temporário.
 *
 * Usa o nome esperado e, se não existir, o primeiro .txt/.srt encontrado
 * (algumas versões do whisper.cpp mudam o sufixo).
 *
 * @returns {{ actualTxt: string, actualSrt: string }}
 */
export function resolveOutputFiles(tmpDir, audioPath) {
  const outputName = path.basename(audioPath, path.extname(audioPath));
  let actualTxt = fs.existsSync(path.join(tmpDir, `${outputName}.txt`)) ? path.join(tmpDir, `${outputName}.txt`) : '';
  let actualSrt = fs.existsSync(path.join(tmpDir, `${outputName}.srt`)) ? path.join(tmpDir, `${outputName}.srt`) : '';

  if (!actualTxt || !actualSrt) {
    const files = fs.readdirSync(tmpDir);
    const txtFound = files.find((f) => f.endsWith('.txt'));
    const srtFound = files.find((f) => f.endsWith('.srt'));
    if (txtFound) actualTxt = path.join(tmpDir, txtFound);
    if (srtFound) actualSrt = path.join(tmpDir, srtFound);
  }

  return { actualTxt, actualSrt };
}

/**
 * Extrai texto e segmentos dos arquivos gerados.
 *
 * @returns {{ text: string, segments: Array }}
 */
export function readTranscription({ actualTxt, actualSrt }) {
  const text = actualTxt ? fs.readFileSync(actualTxt, 'utf8').trim() : '';
  const segments = actualSrt ? parseSrt(fs.readFileSync(actualSrt, 'utf8')) : [];
  return { text, segments };
}
