/**
 * Args do FFmpeg e execução do embed de legendas por contêiner.
 *
 * - MP4: legenda **queimada** (hardcode) via `-vf subtitles=...`. MP4 não aceita
 *   `srt` como faixa de forma universal; re-encodar é a única opção portátil.
 * - MKV: legenda como **faixa** (`-c:v copy -c:s srt`), sem re-encode.
 *
 * O arquivo de saída preserva a extensão do vídeo original: um `.mkv` nunca
 * recebe conteúdo MP4 (bug histórico: `rename('x.mkv.subbed.mp4', 'x.mkv')`).
 */

import fs from 'node:fs';
import path from 'node:path';
import { containerOutputArgs, normalizeContainer } from '../lifecycle/container.js';

/**
 * Monta os args do FFmpeg para embutir as legendas.
 *
 * @param {object} params
 * @param {string} params.videoPath - Vídeo original
 * @param {Array<{file: string, language: string}>} params.subFiles - Legendas baixadas
 * @returns {{ args: string[], container: string, tmpOutput: string }}
 */
export function buildEmbedArgs({ videoPath, subFiles }) {
  const ext = path.extname(videoPath);
  const container = normalizeContainer(ext.slice(1));
  const tmpOutput = `${videoPath}.subbed${ext}`;

  const inputs = ['-i', videoPath];
  for (const sub of subFiles) inputs.push('-i', sub.file);

  const args = [
    '-hide_banner', '-loglevel', 'error', '-nostats', '-y',
    ...inputs, '-progress', 'pipe:1',
  ];

  if (container === 'mkv') {
    // Legenda como faixa, sem re-encode do vídeo.
    args.push('-map', '0', '-c:v', 'copy', '-c:a', 'copy');
    for (let i = 0; i < subFiles.length; i++) {
      args.push('-map', `${i + 1}:0`, '-c:s', 'srt');
      args.push(`-metadata:s:s:${i}`, `language=${subFiles[i].language}`);
    }
  } else {
    // Hardcode (comportamento histórico do MP4).
    const filters = subFiles.map((sub) => {
      const escaped = sub.file.replace(/'/g, "\\'").replace(/:/g, '\\:');
      return `subtitles='${escaped}':force_style='FontSize=24'`;
    });
    args.push('-vf', filters.join(','));
    args.push('-c:v', 'libx264', '-crf', '18', '-preset', 'fast');
    args.push('-c:a', 'copy', ...containerOutputArgs(container));
  }

  args.push(tmpOutput);
  return { args, container, tmpOutput };
}

/**
 * Copia as legendas ao lado do vídeo (`video.pt.srt`).
 *
 * @param {string} videoPath
 * @param {Array<{file: string, language: string}>} subFiles
 */
export async function copySidecars(videoPath, subFiles) {
  const videoDir = path.dirname(videoPath);
  const videoBase = path.basename(videoPath, path.extname(videoPath));
  for (const sub of subFiles) {
    const dest = path.join(videoDir, `${videoBase}.${sub.language}${path.extname(sub.file)}`);
    await fs.promises.copyFile(sub.file, dest).catch(() => {});
  }
}

/** Remove o output parcial sem derrubar o fluxo. */
export function unlinkQuietly(file) {
  try {
    fs.promises.unlink(file).catch(() => {});
  } catch {
    /* ignora */
  }
}