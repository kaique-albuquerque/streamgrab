/**
 * Status de instalação de modelos (consulta somente leitura).
 */

import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_MODEL, getModelEntry, listModelIds } from './catalog.js';
import { findInstalledIn, modelSearchDirs } from './models-dir.js';
import { readMarker } from './marker.js';

function sizeOf(p) {
  try {
    if (fs.existsSync(p)) return fs.statSync(p).size;
  } catch {
    /* ignora */
  }
  return 0;
}

/** Status de um modelo desconhecido (nunca instalado). */
function unknownModelStatus(model) {
  return {
    installed: false,
    model,
    label: '',
    fileName: '',
    path: '',
    dir: '',
    externalDir: '',
    size: 0,
    expectedSize: 0,
    percent: 0,
    partialSize: 0,
    note: '',
    heavy: false,
    hashVerified: false,
    error: `Modelo desconhecido: ${model}. Opções: ${listModelIds().join(', ')}`,
  };
}

/**
 * Status do modelo em `modelsDir`.
 *
 * @param {string} modelsDir - Diretório gravável onde o app baixa o modelo
 * @param {string} [model='small'] - Chave do catálogo
 * @param {object} [options]
 * @param {string[]} [options.extraDirs] - Diretórios só-leitura a consultar
 *   quando o modelo não está em `modelsDir` (instalações do whisper.cpp).
 * @returns {{ installed: boolean, model: string, label: string, fileName: string,
 *             path: string, dir: string, externalDir: string, size: number,
 *             expectedSize: number, percent: number, partialSize: number,
 *             note: string, heavy: boolean, hashVerified: boolean }}
 */
export function getModelStatus(modelsDir, model = DEFAULT_MODEL, { extraDirs = [] } = {}) {
  const info = getModelEntry(model);
  if (!info) return unknownModelStatus(model);

  const modelPath = path.join(modelsDir, info.fileName);
  const partialSize = sizeOf(`${modelPath}.part`);
  const primarySize = sizeOf(modelPath);

  // Fallback só-leitura: modelo já trazido por uma instalação do whisper.cpp
  // conta como instalado (e é usado direto, sem baixar de novo).
  const externalPath = primarySize >= info.minSize ? '' : findInstalledIn(extraDirs, modelsDir, info);

  const size = externalPath ? sizeOf(externalPath) : primarySize;
  const installed = Boolean(externalPath) || primarySize >= info.minSize;
  const resolvedPath = externalPath || modelPath;
  const marker = readMarker(resolvedPath);
  // Instalações antigas (antes da verificação por hash) não têm marcador:
  // continuam válidas por tamanho, apenas sem a confirmação extra.
  const hashVerified = Boolean(marker && marker.sha256 === info.sha256 && marker.size === size);

  return {
    installed,
    model,
    label: info.label,
    fileName: info.fileName,
    path: resolvedPath,
    dir: externalPath ? path.dirname(externalPath) : modelsDir,
    externalDir: externalPath ? path.dirname(externalPath) : '',
    size,
    expectedSize: info.expectedSize,
    percent: installed ? 100 : Math.min(99, Math.round((partialSize / info.expectedSize) * 100)),
    partialSize,
    note: info.note,
    heavy: Boolean(info.heavy),
    hashVerified,
  };
}

/**
 * Status de todos os modelos do catálogo, na ordem de exibição.
 *
 * @param {string} modelsDir - Diretório gravável dos modelos
 * @param {object} [options]
 * @param {string[]} [options.extraDirs] - Diretórios só-leitura de fallback
 * @returns {Array<ReturnType<typeof getModelStatus>>}
 */
export function listModels(modelsDir, { extraDirs = [] } = {}) {
  return listModelIds().map((model) => getModelStatus(modelsDir, model, { extraDirs }));
}

/**
 * Status de um modelo na ordem de busca padrão: diretório gravável do app e,
 * se o modelo não estiver lá, as instalações já existentes do whisper.cpp.
 *
 * @param {string} model - Chave do catálogo
 * @param {string} [engineDir] - Diretório de modelos do motor (whisper.cpp)
 */
export function getModelStatusFor(model, engineDir = '') {
  const [primary, ...extraDirs] = modelSearchDirs(engineDir);
  return getModelStatus(primary || '', model, { extraDirs });
}

/** Igual a `getModelStatusFor`, para todos os modelos do catálogo. */
export function listModelsFor(engineDir = '') {
  const [primary, ...extraDirs] = modelSearchDirs(engineDir);
  return listModels(primary || '', { extraDirs });
}
