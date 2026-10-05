/**
 * P8 — Validação de payloads: app (reveal / export logs / register root).
 */

import { isSafeAbsolutePath, isPathWithin } from './security-primitives.js';
import { getPreviewDir } from '../src/preview.js';

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

/** Valida o payload de `history:export`. */
export function validateExportHistoryPayload(payload = {}, allowedRoots = []) {
  const format = payload?.format === 'csv' ? 'csv' : 'json';
  const rawPath = typeof payload?.filePath === 'string' ? payload.filePath.trim() : '';

  let filePath = '';
  if (rawPath) {
    if (!isSafeAbsolutePath(rawPath)) return null;
    if (!allowedRoots.some((root) => typeof root === 'string' && root.trim() && isPathWithin(rawPath, root))) {
      return null;
    }
    filePath = rawPath;
  }

  let entries = null;
  if (Array.isArray(payload?.entries)) {
    entries = payload.entries
      .filter((e) => e && typeof e === 'object')
      .slice(0, 10000)
      .map((e) => ({
        id: String(e.id || '').slice(0, 64),
        title: String(e.title || '').slice(0, 200),
        url: String(e.url || '').slice(0, 2048),
        provider: String(e.provider || '').slice(0, 64),
        format: String(e.format || '').slice(0, 64),
        destination: String(e.destination || '').slice(0, 1024),
        status: String(e.status || '').slice(0, 32),
        size: Number(e.size) || 0,
        durationMs: Number(e.durationMs) || 0,
        date: String(e.date || '').slice(0, 64),
      }));
  }

  return { format, filePath, entries };
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
