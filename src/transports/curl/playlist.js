/**
 * Playlist utilities — extensao segura e reescrita de playlists HLS.
 */

import path from 'node:path';

const SAFE_SEGMENT_EXT = new Set([
  'ts', 'mp4', 'm4s', 'm2ts', 'mts', 'aac', 'mp3',
  'mov', 'm4a', '3gp', 'mj2', 'vob', 'wav',
]);

/** Extensao segura para salvar um segmento/mapa localmente. */
export function extForUri(uri, fallback) {
  const m = String(uri).match(/\.([a-z0-9]{1,5})(?:[?#]|$)/i);
  const e = m ? m[1].toLowerCase() : '';
  return SAFE_SEGMENT_EXT.has(e) ? e : fallback;
}

/**
 * Reescreve a playlist media trocando URLs remotas por arquivos locais.
 * @param {string} text
 * @param {Map<string,string>} segMap — url resolvida -> arquivo local.
 * @param {Map<string,string>} keyFiles — url da chave -> arquivo local.
 * @param {Map<string,string>} mapFiles — url do init -> arquivo local.
 * @param {string} baseUrl
 */
export function rewritePlaylist(text, segMap, keyFiles, mapFiles, baseUrl) {
  return text
    .split(/\r?\n/)
    .map((rawLine) => {
      const line = rawLine.trim();
      if (!line) return '';
      if (!line.startsWith('#')) {
        const resolved = new URL(line, baseUrl).toString();
        const local = segMap.get(resolved);
        return local ? path.basename(local) : line;
      }
      if (line.includes('URI="')) {
        return line.replace(/URI="([^"]*)"/g, (match, u) => {
          const resolved = new URL(u, baseUrl).toString();
          const local = keyFiles.get(resolved) || mapFiles.get(resolved);
          return local ? `URI="${path.basename(local)}"` : match;
        });
      }
      return line;
    })
    .join('\n');
}
