/**
 * Utilitários de URL e nome de arquivo usados pela CLI.
 */

export function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function ensureExt(name, ext) {
  const safe = String(ext || '').replace(/^\./, '');
  if (!safe) return name;
  const re = new RegExp(`\\.${safe}$`, 'i');
  return re.test(name) ? name : `${name}.${safe}`;
}
