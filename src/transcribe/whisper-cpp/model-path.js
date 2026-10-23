/**
 * Resolução do caminho do modelo GGML para a transcrição.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getModelEntry, listModelIds } from '../model-manager.js';

/**
 * Obtem o caminho completo do modelo GGML.
 *
 * @param {string} model - Id do modelo no catálogo ('tiny', 'base', 'small', ...)
 * @param {string[]} dirs - Diretórios candidatos, em ordem de preferência
 * @returns {string} Caminho do modelo
 * @throws {Error} Se o modelo nao for conhecido ou nao estiver instalado
 */
export function resolveModelPath(model, dirs) {
  const info = getModelEntry(model);
  if (!info) {
    throw new Error(`Modelo desconhecido: ${model}. Opcoes: ${listModelIds().join(', ')}`);
  }

  // WHISPER_MODEL_PATH é um override explícito do usuário (um arquivo único):
  // vale para qualquer modelo e tem prioridade sobre o catálogo.
  const envModel = process.env.WHISPER_MODEL_PATH;
  if (envModel) {
    if (isNonEmptyFile(envModel)) {
      return envModel;
    }

    throw new Error(
      `Modelo definido em WHISPER_MODEL_PATH nao encontrado ou vazio: ${envModel}\n` +
      'Remova a variavel ou aponte para um arquivo .bin valido.'
    );
  }

  const candidates = [...new Set(dirs.filter(Boolean))].map((dir) => path.join(dir, info.fileName));

  for (const candidate of candidates) {
    if (isModelFileReady(candidate, info)) {
      return candidate;
    }
  }

  const partial = candidates.find((candidate) => fs.existsSync(candidate));
  if (partial) {
    throw new Error(
      `Modelo ${model} encontrado, mas parece incompleto: ${partial}\n` +
      'Baixe novamente em Transcrever > Modelos Whisper.'
    );
  }

  throw new Error(
    `Modelo ${model} nao instalado (${info.fileName}).\n` +
    `Abra Transcrever > Modelos Whisper e baixe o modelo "${info.label}".`
  );
}

function isNonEmptyFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

function isModelFileReady(modelPath, info) {
  if (!modelPath || !fs.existsSync(modelPath)) {
    return false;
  }

  const minSize = info?.minSize || 0;
  if (minSize <= 0) {
    return true;
  }

  try {
    const stat = fs.statSync(modelPath);
    return stat.isFile() && stat.size > minSize;
  } catch {
    return false;
  }
}
