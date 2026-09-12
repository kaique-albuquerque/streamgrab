/**
 * Shared helpers for models — small pure utilities used across modules.
 */

/** ISO 8601 timestamp for model fields. */
export function nowIso() {
  return new Date().toISOString();
}

/** Deep-clone a plain serializable object (no functions, no circular refs). */
export function cloneSerializableObject(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  return JSON.parse(JSON.stringify(input));
}
