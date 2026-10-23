/**
 * Coerção de tipos e clamps dos settings.
 */

import { DEFAULT_SETTINGS, SCHEMA } from './defaults.js';

/** Coage um valor segundo o schema. Retorna `undefined` para chave desconhecida. */
export function coerce(key, value, current) {
  const spec = SCHEMA[key];
  if (!spec) return undefined; // chave desconhecida: ignorada
  let out = value;
  if (spec.type === 'number') {
    out = Number(value);
    if (!Number.isFinite(out)) return current; // NaN -> mantem atual
    if (spec.clamp) out = Math.min(spec.clamp[1], Math.max(spec.clamp[0], out));
  } else if (spec.type === 'boolean') {
    out = Boolean(value);
  } else if (spec.type === 'json') {
    // boolean (liga/desliga) ou objeto (opcoes do Smart Turbo)
    if (typeof value === 'boolean') {
      out = value;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out = { ...value };
    } else {
      return current;
    }
  } else {
    out = String(value);
  }
  return out;
}

/**
 * Normaliza um objeto cru contra o schema: ignora chaves desconhecidas,
 * coage tipos e aplica clamps. Retorna um objeto somente com chaves validas.
 */
export function normalizeSettings(raw = {}) {
  if (raw === null || typeof raw !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'version') continue;
    const coerced = coerce(k, v, DEFAULT_SETTINGS[k]);
    if (coerced !== undefined) out[k] = coerced;
  }
  return out;
}
