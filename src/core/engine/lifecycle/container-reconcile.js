/**
 * Reconciliação entre o container pedido e o container real do arquivo.
 *
 * Quando o setting pede MKV mas a fonte entregou MP4 (URL direta apontando
 * para um MP4), renomear para `.mkv` produziria um arquivo que não abre em
 * players que confiam na extensão. A reconciliação mantém a extensão real e
 * devolve um aviso para o usuário.
 */

import fs from 'node:fs';
import path from 'node:path';
import { containerMismatch, detectContainerFromFile } from './container-detect.js';

/**
 * Ajusta a extensão do arquivo ao container detectado.
 *
 * Nunca sobrescreve um arquivo existente: se o destino já está ocupado, mantém
 * o nome atual e não avisa (renomear criaria um arquivo duplicado).
 *
 * @param {object} params
 * @param {string} params.filePath - Caminho do arquivo baixado
 * @param {string} params.requested - Container pedido (setting/flag)
 * @returns {{filePath: string, changed: boolean, message: string}}
 */
export function reconcileContainer({ filePath, requested } = {}) {
  const unchanged = { filePath, changed: false, message: '' };
  if (!filePath || !requested) return unchanged;

  const actual = detectContainerFromFile(filePath);
  const mismatch = containerMismatch(requested, actual);
  if (!mismatch) return unchanged;

  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const target = path.join(dir, `${base}.${actual}`);

  // Destino ocupado: não sobrescreve (poderia ser outro download).
  if (fs.existsSync(target)) return unchanged;

  try {
    fs.renameSync(filePath, target);
  } catch {
    return unchanged;
  }

  return { filePath: target, changed: true, message: mismatch.message };
}