/**
 * Validação da entrada da conversão.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ConvertError } from './errors.js';

/** Extensões de vídeo aceitas na entrada. */
const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mkv', 'webm', 'mov', 'm4v', 'ts', 'avi', 'flv', 'wmv', 'mpg', 'mpeg', '3gp',
]);

/**
 * Valida o caminho de entrada e devolve a extensão normalizada.
 *
 * @param {string} inputPath
 * @returns {{ext: string, size: number}} Extensão (minúscula) e tamanho
 * @throws {ConvertError} Quando o caminho é inválido, inexistente ou não-vídeo
 */
export function validateInput(inputPath) {
  if (typeof inputPath !== 'string' || !inputPath.trim()) {
    throw new ConvertError('Arquivo de vídeo não informado.', { code: 'NO_INPUT' });
  }
  if (!fs.existsSync(inputPath)) {
    throw new ConvertError(`Arquivo não encontrado: ${inputPath}`, { code: 'INPUT_NOT_FOUND' });
  }
  if (!fs.statSync(inputPath).isFile()) {
    throw new ConvertError(`Não é um arquivo: ${inputPath}`, { code: 'NOT_A_FILE' });
  }

  const ext = path.extname(inputPath).slice(1).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(ext)) {
    throw new ConvertError(
      `Formato não suportado (${ext || 'sem extensão'}). Use um vídeo (.mp4, .mkv, .webm, .mov…).`,
      { code: 'UNSUPPORTED_INPUT' },
    );
  }

  return { ext, size: fs.statSync(inputPath).size };
}