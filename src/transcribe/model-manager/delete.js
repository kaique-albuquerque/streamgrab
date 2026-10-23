/**
 * Exclusão dos arquivos de um modelo baixado.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getModelEntry, unknownModelError } from './catalog.js';
import { markerPath } from './marker.js';
import { getModelStatus } from './status.js';

/**
 * Remove os arquivos de um modelo (modelo, `.part` e marcador de hash).
 *
 * Só aceita ids do catálogo — o caminho é sempre derivado de `fileName`,
 * nunca do valor recebido.
 *
 * @param {string} modelsDir - Diretório dos modelos
 * @param {string} model - Chave do catálogo
 * @returns {{ model: string, removed: string[], status: ReturnType<typeof getModelStatus> }}
 */
export function deleteModel(modelsDir, model) {
  const info = getModelEntry(model);
  if (!info) throw unknownModelError(model);

  const modelPath = path.join(modelsDir, info.fileName);
  const removed = [];

  for (const target of [modelPath, `${modelPath}.part`, markerPath(modelPath)]) {
    try {
      if (!fs.existsSync(target)) continue;
      fs.rmSync(target, { force: true });
      removed.push(target);
    } catch (err) {
      throw new Error(`Não foi possível excluir ${path.basename(target)}: ${err.message}`);
    }
  }

  return { model, removed, status: getModelStatus(modelsDir, model) };
}
