/**
 * Exclusão dos arquivos de um modelo baixado.
 */

import fs from 'node:fs';
import path from 'node:path';
import { MODEL_CATALOG, getModelEntry, unknownModelError } from './catalog.js';
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
 * @param {object} [options]
 * @param {object} [options.catalog=MODEL_CATALOG] - Catálogo de modelos
 * @returns {{ model: string, removed: string[], status: ReturnType<typeof getModelStatus> }}
 */
export function deleteModel(modelsDir, model, { catalog = MODEL_CATALOG } = {}) {
  const info = getModelEntry(model, catalog);
  if (!info) throw unknownModelError(model, catalog);

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

  return { model, removed, status: getModelStatus(modelsDir, model, { catalog }) };
}
