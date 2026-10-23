/**
 * Sanitização de nomes de arquivo.
 */

// Caracteres inválidos em nomes de arquivo no Windows.
const WINDOWS_INVALID_CHARS = /[<>:"/\\|?*]/g;

// Nomes reservados pelo Windows (CON, PRN, AUX, NUL, COM1..9, LPT1..9).
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Sanitiza um nome de arquivo para ser seguro no Windows:
 * remove < > : " / \ | ? * e espaços/pontos finais.
 */
export function sanitizeFilename(name) {
  let n = String(name ?? '').trim();
  n = n.replace(WINDOWS_INVALID_CHARS, '_');
  n = n.replace(/[.\s]+$/g, '');
  n = n.replace(/^[.\s]+/g, '');
  if (!n) n = 'video';
  const base = n.replace(/\.mp4$/i, '');
  if (RESERVED_NAMES.test(base)) n = `_${base}`;
  return n;
}

/**
 * Adiciona .mp4 automaticamente se o usuário não informou extensão.
 */
export function ensureMp4(name) {
  return /\.mp4$/i.test(name) ? name : `${name}.mp4`;
}
