/**
 * Resolução da extensão do arquivo final.
 */

/** Extensões de mídia conhecidas (usadas ao limpar nomes vindos de formulário). */
const MEDIA_EXTENSIONS = [
  'mp4', 'mkv', 'webm', 'mov', 'm4v', 'ts', 'm4a', 'mp3', 'aac',
  'flac', 'opus', 'wav', 'ogg', 'avi', 'flv', 'wmv', 'mpg', 'mpeg', '3gp',
];
const MEDIA_EXT_RE = new RegExp(`\\.(${MEDIA_EXTENSIONS.join('|')})$`, 'i');

/**
 * Remove do nome base uma extensão de mídia diferente da final.
 * Evita "video.mp4.ts" (e, após extrair áudio, "video.mp4.m4a") quando o
 * nome informado já vinha com extensão de outro container.
 */
export function stripForeignExtension(base, ext) {
  const name = String(base ?? '');
  const target = String(ext || '').toLowerCase();
  const found = name.match(MEDIA_EXT_RE);
  if (!found) return name;
  return found[0].toLowerCase() === target ? name : name.slice(0, -found[0].length);
}

export function extensionFor(prepared, sourceType) {
  if (prepared.strategy === 'mux' || prepared.strategy === 'mux-multi') return '.mp4';
  const st = String(sourceType || '').toLowerCase();
  if (st === 'hls' || st === 'dash') return '.mp4';
  const url = String(prepared.downloadUrl || prepared.url || '');
  try {
    const pathname = new URL(url).pathname || '';
    const m = pathname.match(/\.([A-Za-z0-9]{1,12})$/);
    return m ? `.${m[1].toLowerCase()}` : '.mp4';
  } catch {
    return '.mp4';
  }
}
