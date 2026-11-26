/**
 * Validação de payloads: conversão de vídeo (convert:*).
 */

import fs from 'node:fs';
import { isSafeAbsolutePath } from './security-primitives.js';

/** Extensões de vídeo aceitas na entrada. */
const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mkv', 'webm', 'mov', 'm4v', 'ts', 'avi', 'flv', 'wmv', 'mpg', 'mpeg', '3gp',
]);

/** Valida o payload de `convert:start`. Retorna o payload limpo ou null. */
export function validateConvertPayload(payload = {}) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const inputPath = typeof payload?.inputPath === 'string' ? payload.inputPath.trim() : '';
  if (!isSafeAbsolutePath(inputPath)) return null;

  const ext = inputPath.split('.').pop()?.toLowerCase() || '';
  if (!VIDEO_EXTENSIONS.has(ext)) return null;

  try {
    if (!fs.statSync(inputPath).isFile()) return null;
  } catch {
    return null;
  }

  return { inputPath };
}

/** Valida o payload de `convert:cancel` (jobId). */
export function validateConvertJobPayload(payload = {}) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const jobId = typeof payload?.jobId === 'string' ? payload.jobId.trim() : '';
  if (!jobId || jobId.length > 100 || !/^[A-Za-z0-9_:-]+$/.test(jobId)) return null;
  return { jobId };
}