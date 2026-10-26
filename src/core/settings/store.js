/**
 * Store de settings persistidos (JSON atômico via storage.js).
 */

import { createJsonStore } from '../storage.js';

import { coerce } from './coerce.js';
import { DEFAULT_SETTINGS } from './defaults.js';

/**
 * Cria o store de settings persistidos.
 *
 * Opcoes: file (obrigatorio), defaults (opcional, default DEFAULT_SETTINGS),
 * storage (opcional, injetavel p/ testes).
 */
export function createSettingsStore({ file, defaults = DEFAULT_SETTINGS, storage } = {}) {
  if (!file && !storage) throw new TypeError('createSettingsStore: file e obrigatorio');
  const store = storage || createJsonStore({ file, version: 1, defaults });
  store.load();

  return {
    file: store.file,
    store,

    /** Todos os settings (clone). */
    all() {
      const rest = { ...store.get() };
      delete rest.version;
      return rest;
    },

    /** Valor de uma chave (default se ausente). */
    get(key) {
      const data = store.get();
      return key in data ? data[key] : defaults[key];
    },

    /** Define uma chave (validada) e persiste. */
    set(key, value) {
      const current = this.all();
      const coerced = coerce(key, value, current[key]);
      if (coerced === undefined) return this.get(key); // desconhecida: no-op
      store.save({ ...current, [key]: coerced });
      return this.get(key);
    },

    /** Aplica varias chaves de uma vez. */
    update(partial = {}) {
      const current = this.all();
      const next = { ...current };
      for (const [k, v] of Object.entries(partial)) {
        const coerced = coerce(k, v, current[k]);
        if (coerced !== undefined) next[k] = coerced;
      }
      store.save(next);
      return this.all();
    },

    /** Restaura os defaults e persiste. */
    reset() {
      store.save({ ...defaults });
      return this.all();
    },
  };
}
