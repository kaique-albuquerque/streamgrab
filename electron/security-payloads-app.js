/**
 * P8 — Validação de payloads: app (reveal / export logs / register root).
 */

import path from 'node:path';
import { isSafeAbsolutePath, isPathWithin } from './security-primitives.js';
import { getPreviewDir } from '../src/preview.js';

/** Valida o payload de `preview:read-file` / `preview:clear`. */
export function validatePreviewFilePathPayload(payload = {}, previewDir = '') {
  const filePath = typeof payload?.filePath === 'string' ? payload.filePath.trim() : '';
  if (!filePath || typeof previewDir !== 'string' || !previewDir.trim()) return null;
  if (!isSafeAbsolutePath(filePath)) return null;

  const trimmedDir = previewDir.trim();
  const targetDir = trimmedDir.endsWith('streamgrab-preview') || trimmedDir.endsWith('streamgrab-preview\\') || trimmedDir.endsWith('streamgrab-preview/')
    ? trimmedDir
    : path.join(trimmedDir, 'streamgrab-preview');

  if (!isSafeAbsolutePath(targetDir) || !isPathWithin(filePath, targetDir)) {
    return null;
  }
  return { filePath };
}

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

/** Valida o payload de `preview:read-file` e `preview:clear`. */
export function validatePreviewPathPayload(payload = {}, allowedRoots = []) {
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
