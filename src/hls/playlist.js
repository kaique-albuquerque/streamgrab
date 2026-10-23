import { parseAttributes } from './attributes.js';

const STREAM_INF_RE = /^#EXT-X-STREAM-INF:(.*)$/;
const MEDIA_RE = /^#EXT-X-MEDIA:(.*)$/;

/**
 * Interpreta o texto de uma playlist HLS (sem rede).
 *
 * Retorna:
 *  - { kind: 'master', variants, baseUrl }  → contém #EXT-X-STREAM-INF
 *  - { kind: 'media' }                      → playlist de segmentos (variant)
 *  - { kind: 'unknown' }                    → não parece HLS padrão
 */
export function parsePlaylistText(text, baseUrl = '') {
  const lines = text.split(/\r?\n/).map((l) => l.trim());

  const variants = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(STREAM_INF_RE);
    if (!match) continue;

    const attrs = parseAttributes(match[1]);

    // A URI da variante é a próxima linha que não seja comentário/vazia.
    let uri = null;
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j]) continue;
      if (lines[j].startsWith('#')) break; // linha de atributo sem URI
      uri = lines[j];
      break;
    }
    if (!uri) continue;

    const [w, h] = String(attrs.RESOLUTION || '').split('x').map(Number);
    variants.push({
      uri,
      resolution: attrs.RESOLUTION || '',
      width: Number.isFinite(w) ? w : 0,
      height: Number.isFinite(h) ? h : 0,
      bandwidth: Number(attrs.BANDWIDTH) || 0,
      codecs: attrs.CODECS || '',
    });
  }

  // P12: parse #EXT-X-MEDIA tags (audio groups + subtitle renditions)
  const mediaTracks = [];
  for (let i = 0; i < lines.length; i++) {
    const mediaMatch = lines[i].match(MEDIA_RE);
    if (!mediaMatch) continue;
    const attrs = parseAttributes(mediaMatch[1]);
    const type = String(attrs.TYPE || '').toUpperCase();
    if (type !== 'AUDIO' && type !== 'SUBTITLES') continue;
    // URI can be in the URI attribute or on the next line (rare legacy format)
    let uri = attrs.URI || null;
    if (!uri) {
      for (let j = i + 1; j < lines.length; j++) {
        if (!lines[j]) continue;
        if (lines[j].startsWith('#')) break;
        uri = lines[j];
        break;
      }
    }
    mediaTracks.push({
      type: type === 'AUDIO' ? 'audio' : 'subtitle',
      groupId: attrs.GROUP_ID || '',
      language: attrs.LANGUAGE || '',
      name: attrs.NAME || '',
      default: attrs.DEFAULT === 'YES',
      autoSelect: attrs.AUTOSELECT === 'YES',
      uri,
    });
  }

  const audioTracks = mediaTracks.filter((t) => t.type === 'audio');
  const subtitleTracks = mediaTracks.filter((t) => t.type === 'subtitle');

  if (variants.length > 0) {
    // Remove duplicatas (mesma URI) e ordena por resolucao, depois bandwidth.
    const seen = new Set();
    const unique = variants.filter((v) => {
      if (seen.has(v.uri)) return false;
      seen.add(v.uri);
      return true;
    });
    unique.sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth);
    // baseUrl: apos redirects, URIs relativas resolvem contra a URL final.
    return { kind: 'master', variants: unique, baseUrl: baseUrl || '', audioTracks, subtitleTracks };
  }

  if (text.includes('#EXTINF') || text.includes('#EXT-X-TARGETDURATION')) {
    return { kind: 'media', audioTracks: [], subtitleTracks: [] };
  }

  return { kind: 'unknown', audioTracks: [], subtitleTracks: [] };
}
