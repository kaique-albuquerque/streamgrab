/**
 * P7 — Settings persistidos (barrel).
 *
 * Seção 22 do architect.md. Opcoes de usuario persistidas em JSON atomico
 * (storage.js). Regras:
 *  - apenas chaves conhecidas sao aceitas (typos nao corrompem o arquivo);
 *  - valores passam por coerção de tipo e limites (clamp);
 *  - `reset()` restaura os defaults.
 *
 * Implementação em ./settings/:
 *  - defaults.js → DEFAULT_SETTINGS e SCHEMA
 *  - coerce.js   → coerce (privado) e normalizeSettings
 *  - store.js    → createSettingsStore
 */

export { DEFAULT_SETTINGS } from './settings/defaults.js';
export { normalizeSettings } from './settings/coerce.js';
export { createSettingsStore } from './settings/store.js';
