/**
 * Diretórios onde os modelos podem estar (gravável do app + instalações do motor).
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Origem do diretório gravável de modelos do app (userData/whisper/models).
 *
 * O CLI não registra nada — nesse caso só o diretório do motor conta. O app
 * registra um resolvedor para que download, verificação e execução usem
 * SEMPRE o mesmo diretório; sem isso o modelo baixado na interface não seria
 * encontrado na hora de transcrever.
 */
let modelsDirResolver = null;

/** Registra a origem do diretório gravável de modelos (função, ou null para limpar). */
export function setModelsDirResolver(resolver) {
  modelsDirResolver = typeof resolver === 'function' ? resolver : null;
}

/** Diretório gravável de modelos do app ('' quando não registrado). */
export function getModelsDir() {
  try {
    return modelsDirResolver?.() || '';
  } catch {
    return '';
  }
}

/**
 * Diretórios onde um modelo pode estar, na ordem de busca.
 *
 * O primeiro é o gravável (é onde download e exclusão atuam). Os demais são
 * instalações do whisper.cpp já existentes, usadas apenas como fallback de
 * leitura — assim um modelo já presente não é baixado de novo.
 *
 * @param {string} [engineDir] - Diretório de modelos do motor (whisper.cpp)
 * @returns {string[]}
 */
export function modelSearchDirs(engineDir = '') {
  return [...new Set([process.env.WHISPER_MODEL_DIR, getModelsDir(), engineDir].filter(Boolean))];
}

/** Caminho do modelo completo em um dos diretórios extras ('' se nenhum). */
export function findInstalledIn(dirs, primaryDir, info) {
  for (const dir of dirs) {
    if (!dir || dir === primaryDir) continue;
    const candidate = path.join(dir, info.fileName);
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile() && stat.size >= info.minSize) return candidate;
    } catch {
      /* segue para o próximo diretório */
    }
  }
  return '';
}
