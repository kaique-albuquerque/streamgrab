/** Obtem um titulo legivel a partir do nome do arquivo de video. */

import path from 'node:path';

/**
 * Obtem um titulo legivel a partir do nome do arquivo de video.
 *
 * @param {string} videoPath - Caminho do video
 * @returns {string} Titulo formatado
 */
export function titleFromVideoPath(videoPath) {
  const base = path.basename(videoPath, path.extname(videoPath));
  return base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}
