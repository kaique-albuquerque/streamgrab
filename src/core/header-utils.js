/**
 * Header-related utilities for StreamGrab.
 *
 * Extracted from src/utils.js (Sprint 2.3) for focused module responsibility.
 * All exports are re-exported from src/utils.js for backward compatibility.
 */

// Normaliza a grafia dos headers mais comuns.
const CANONICAL_HEADERS = {
  referer: 'Referer',
  origin: 'Origin',
  'user-agent': 'User-Agent',
};

const UNSAFE_PROPS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Normaliza grafia de headers (ex.: "user-agent" → "User-Agent"), remove vazios,
 * ignora propriedades de poluição de protótipo e sanitiza CRLF/NUL de valores.
 */
export function normalizeHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    if (UNSAFE_PROPS.has(k)) continue;
    const value = String(v ?? '').replace(/[\r\n\0]/g, '').trim();
    if (!value) continue;
    const lower = k.toLowerCase();
    out[CANONICAL_HEADERS[lower] || k] = value;
  }
  return out;
}
