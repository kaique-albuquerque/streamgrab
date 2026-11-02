/**
 * Sanitização de nomes de arquivo.
 */

// Caracteres inválidos em nomes de arquivo no Windows (inclui caracteres de controle 0x00-0x1F).
const WINDOWS_INVALID_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

// Nomes reservados pelo Windows (CON, PRN, AUX, NUL, COM1..9, LPT1..9).
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Sanitiza um nome de arquivo para ser seguro no Windows:
 * remove < > : " / \ | ? *, caracteres de controle (0x00-0x1F) e espaços/pontos finais.
 */
export function sanitizeFilename(name) {
  let n = String(name ?? '').trim();
  n = n.replace(WINDOWS_INVALID_CHARS, '_');
  n = n.replace(/[.\s]+$/g, '');
  n = n.replace(/^[.\s]+/g, '');
  if (!n) n = 'video';
  const dotIndex = n.indexOf('.');
  const base = dotIndex !== -1 ? n.slice(0, dotIndex) : n;
  if (RESERVED_NAMES.test(base)) n = `_${n}`;
  return n;
}

/**
 * Adiciona .mp4 automaticamente se o usuário não informou extensão.
 */
export function ensureMp4(name) {
  return /\.mp4$/i.test(name) ? name : `${name}.mp4`;
}
