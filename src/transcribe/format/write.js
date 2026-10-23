/** Persistencia dos arquivos de transcricao ao lado do video. */

import fs from 'node:fs';
import path from 'node:path';
import { formatTxt } from './txt.js';
import { formatMd } from './md.js';
import { formatSrt } from './srt.js';

/**
 * Salva arquivos de transcricao ao lado do video.
 *
 * @param {object} params
 * @param {string} params.videoPath - Caminho do video original
 * @param {string} params.text - Texto da transcricao
 * @param {Array} params.segments - Segmentos com timestamps
 * @param {string} [params.title] - Titulo do documento
 * @param {string[]} [params.formats=['txt', 'md']] - Formatos de saida
 * @returns {Promise<{ files: Array<{ path: string, format: string, size: number }> }>}
 */
export async function writeTranscription({
  videoPath,
  text,
  segments,
  title,
  formats = ['txt', 'md'],
}) {
  const videoDir = path.dirname(videoPath);
  const videoBase = path.basename(videoPath, path.extname(videoPath));
  const files = [];

  for (const format of formats) {
    const ext = `.${format}`;
    const filePath = path.join(videoDir, `${videoBase}.transcription${ext}`);

    let content = '';
    if (format === 'txt') {
      content = formatTxt({ text, title });
    } else if (format === 'md') {
      content = formatMd({ segments, title });
    } else if (format === 'srt') {
      content = formatSrt({ segments });
    } else {
      continue;
    }

    fs.writeFileSync(filePath, content, 'utf8');
    const stat = fs.statSync(filePath);

    files.push({
      path: filePath,
      format,
      size: stat.size,
    });
  }

  return { files };
}
