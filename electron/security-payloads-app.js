/**
 * P8 — Validação de payloads: app (reveal / export logs / register root).
 */

import { isSafeAbsolutePath, isPathWithin } from './security-primitives.js';

/** Valida o payload de `app:open-file` / `app:show-in-folder`. */
export function validateRevealPayload(payload = {}, allowedRoots = []) {
  const filePath = typeof payload?.filePath === 'string' ? payload.filePath.trim() : '';
  if (!filePath) return null;
  if (!isSafeAbsolutePath(filePath)) return null;
  if (!allowedRoots.some((root) => typeof root === 'string' && root.trim() && isPathWithin(filePath, root))) {
    return null;
  }
  return { filePath };
}

/** Valida o payload de `app:export-logs`. */
export function validateExportLogsPayload(payload = {}, allowedRoots = []) {
  const customPath = typeof payload?.path === 'string' ? payload.path.trim() : '';
  if (!customPath) return { path: null };
  if (!isSafeAbsolutePath(customPath)) return null;
  if (!allowedRoots.some((root) => typeof root === 'string' && root.trim() && isPathWithin(customPath, root))) {
    return null;
  }
  return { path: customPath };
}

/**
 * Registra uma raiz permitida para abertura/exportação de arquivos se for um caminho absoluto seguro.
 */
export function registerRevealRoot(dir, allowedRoots) {
  if (typeof dir !== 'string' || !dir.trim() || !(allowedRoots instanceof Set)) return false;
  const trimmed = dir.trim();
  if (!isSafeAbsolutePath(trimmed)) return false;
  allowedRoots.add(trimmed);
  return true;
}
