/**
 * Validação do payload de `history:export`.
 */

import { isSafeAbsolutePath, isPathWithin } from '../security-primitives.js';

/**
 * Retorna { format, filePath, entries } limpos ou null se payload/filePath forem invalidos.
 */
export function validateHistoryExportPayload(payload = {}, allowedRoots = []) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const format = payload.format === 'csv' ? 'csv' : 'json';
  const filePath = typeof payload.filePath === 'string' ? payload.filePath.trim() : '';
  if (filePath) {
    if (!isSafeAbsolutePath(filePath)) return null;
    if (Array.isArray(allowedRoots) && allowedRoots.length > 0) {
      if (!allowedRoots.some((root) => typeof root === 'string' && root.trim() && isPathWithin(filePath, root))) {
        return null;
      }
    }
  }

  let entries = null;
  if (Array.isArray(payload.entries)) {
    entries = payload.entries
      .filter((e) => e && typeof e === 'object' && !Array.isArray(e))
      .map((e) => ({
        id: String(e.id || '').slice(0, 64),
        title: String(e.title || '').slice(0, 500),
        url: String(e.url || '').slice(0, 2048),
        provider: String(e.provider || '').slice(0, 100),
        format: String(e.format || '').slice(0, 100),
        destination: String(e.destination || '').slice(0, 1024),
        status: String(e.status || '').slice(0, 50),
        size: typeof e.size === 'number' && Number.isFinite(e.size) ? e.size : 0,
        durationMs: typeof e.durationMs === 'number' && Number.isFinite(e.durationMs) ? e.durationMs : 0,
        date: String(e.date || '').slice(0, 100),
      }))
      .slice(0, 10000);
  }

  return { format, filePath, entries };
}
