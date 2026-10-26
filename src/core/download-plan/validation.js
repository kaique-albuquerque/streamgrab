/** Helpers de validação compartilhados pelos modelos. */

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeOptionalObject(value, errorMessage) {
  if (value == null) return null;
  if (!isPlainObject(value)) throw new TypeError(errorMessage);
  return { ...value };
}
