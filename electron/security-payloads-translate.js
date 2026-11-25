/**
 * Validação de payloads: tradução (translate:*).
 */

import fs from 'node:fs';
import { isSafeAbsolutePath, isPathWithin } from './security-primitives.js';
import { DEFAULT_TRANSLATE_MODEL, isKnownTranslateModel } from '../src/translate/model-manager.js';

const TARGET_LANGS = new Set(['pt']);

/**
 * Normaliza o id do modelo recebido do renderer.
 *
 * Só ids do catálogo passam: o renderer nunca escolhe nome de arquivo nem
 * caminho, apenas uma chave conhecida.
 */
function normalizeModel(value, fallback = DEFAULT_TRANSLATE_MODEL) {
  if (value === undefined || value === null || value === '') return fallback;
  const model = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return isKnownTranslateModel(model) ? model : null;
}

/** Valida o payload de `translate:start`. Retorna o payload limpo ou null. */
export function validateTranslateStartPayload(payload = {}, allowedRoots = []) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const srtPath = typeof payload?.srtPath === 'string' ? payload.srtPath.trim() : '';
  if (!isSafeAbsolutePath(srtPath)) return null;

  const roots = Array.isArray(allowedRoots) ? allowedRoots : Array.from(allowedRoots || []);
  if (roots.length > 0 && !roots.some((root) => typeof root === 'string' && root.trim() && isPathWithin(srtPath, root))) {
    return null;
  }

  if (srtPath.split('.').pop()?.toLowerCase() !== 'srt') return null;

  try {
    if (!fs.statSync(srtPath).isFile()) return null;
  } catch {
    return null;
  }

  const model = normalizeModel(payload?.model);
  if (!model) return null;

  const targetLang = typeof payload?.targetLang === 'string' ? payload.targetLang.trim().toLowerCase() : 'pt';
  if (!TARGET_LANGS.has(targetLang)) return null;

  return { srtPath, model, targetLang };
}

/** Valida o payload de `translate:cancel` / operações por jobId. */
export function validateTranslateJobPayload(payload = {}) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const jobId = typeof payload?.jobId === 'string' ? payload.jobId.trim() : '';
  if (!jobId || jobId.length > 100 || !/^[A-Za-z0-9_:-]+$/.test(jobId)) return null;
  return { jobId };
}

/**
 * Valida o payload das operações de modelo (`translate:model-*`).
 *
 * Sem `model`, assume o padrão — mantém compatibilidade com chamadas antigas.
 */
export function validateTranslateModelPayload(payload = {}) {
  if (payload !== undefined && (payload === null || typeof payload !== 'object' || Array.isArray(payload))) {
    return null;
  }
  const model = normalizeModel(payload?.model);
  if (!model) return null;
  return { model };
}