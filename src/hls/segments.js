import { parseAttributes } from './attributes.js';

/**
 * Interpreta uma playlist de segmentos (variant/media).
 *
 * Retorna:
 *  - segments: [{ uri, key }]          URIs dos segmentos (com a chave AES ativa, se houver)
 *  - keys:     [{ uri, iv, method }]   chaves de criptografia distintas (#EXT-X-KEY)
 *  - maps:     [{ uri }]               segmentos de inicialização (#EXT-X-MAP, fMP4)
 *  - targetDuration
 */
export function parseSegmentPlaylist(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const segments = [];
  const keys = new Map();
  const maps = new Map();
  let targetDuration = 0;
  let totalDuration = 0;
  let currentKey = null;
  let pendingExtinf = null;

  for (const line of lines) {
    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      targetDuration = parseInt(line.split(':')[1], 10) || 0;
    } else if (line.startsWith('#EXTINF:')) {
      const dur = parseFloat(line.slice('#EXTINF:'.length).split(',')[0]);
      pendingExtinf = Number.isFinite(dur) ? dur : null;
    } else if (line.startsWith('#EXT-X-KEY:')) {
      const attrs = parseAttributes(line.slice('#EXT-X-KEY:'.length));
      const method = String(attrs.METHOD || 'NONE').toUpperCase();
      if (method === 'NONE') {
        currentKey = null;
      } else if (attrs.URI) {
        currentKey = { uri: attrs.URI, iv: attrs.IV || '', method };
        if (!keys.has(attrs.URI)) keys.set(attrs.URI, currentKey);
      }
    } else if (line.startsWith('#EXT-X-MAP:')) {
      const attrs = parseAttributes(line.slice('#EXT-X-MAP:'.length));
      if (attrs.URI && !maps.has(attrs.URI)) maps.set(attrs.URI, { uri: attrs.URI });
    } else if (line && !line.startsWith('#')) {
      // Linha de URI de segmento (segue a linha #EXTINF).
      segments.push({ uri: line, key: currentKey ? { ...currentKey } : null });
      if (pendingExtinf !== null) totalDuration += pendingExtinf;
      pendingExtinf = null;
    }
  }

  return {
    segments,
    keys: [...keys.values()],
    maps: [...maps.values()],
    targetDuration,
    totalDuration,
  };
}
