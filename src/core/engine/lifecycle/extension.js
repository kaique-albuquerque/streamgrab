/**
 * Resolução da extensão do arquivo final.
 */

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
