/**
 * Resolução da extensão do arquivo final.
 */

import { DEFAULT_CONTAINER, extensionForContainer } from './container.js';

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

/**
 * Extensão do arquivo final.
 *
 * Estratégias que produzem o arquivo pelo app (mux, mux-multi, HLS, DASH,
 * URL sem extensão) usam o contêiner escolhido. URL direta **com** extensão
 * própria preserva a dela — trocar `.ts` por `.mkv` renomearia um download
 * que já tem formato definido pela origem.
 *
 * @param {object} prepared - PreparedDownload
 * @param {string} [sourceType] - Tipo da fonte (hls, dash, direct...)
 * @param {string} [container='mp4'] - Contêiner escolhido pelo usuário
 * @returns {string} Extensão com ponto
 */
export function extensionFor(prepared, sourceType, container = DEFAULT_CONTAINER) {
  const chosen = extensionForContainer(container);
  if (prepared.strategy === 'mux' || prepared.strategy === 'mux-multi') return chosen;
  const st = String(sourceType || '').toLowerCase();
  if (st === 'hls' || st === 'dash') return chosen;
  const url = String(prepared.downloadUrl || prepared.url || '');
  try {
    const pathname = new URL(url).pathname || '';
    const m = pathname.match(/\.([A-Za-z0-9]{1,12})$/);
    return m ? `.${m[1].toLowerCase()}` : chosen;
  } catch {
    return chosen;
  }
}
