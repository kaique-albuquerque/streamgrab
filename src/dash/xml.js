/**
 * Helpers XML/MPD puros — parsing de atributos, tags e duracao ISO 8601.
 *
 * Sem I/O e sem dependencia do DOM: o MPD e texto e os helpers sao regex.
 */

/** Resolve uma URL (relativa ou absoluta) contra a base do manifesto. */
export function resolveAbsolute(url, baseUrl) {
  try {
    return new URL(url, baseUrl || undefined).toString();
  } catch {
    return String(url || '');
  }
}

/** Remove tags XML de um trecho e normaliza espacos. */
export function stripTag(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/** Extrai os atributos `nome="valor"` de uma tag XML. */
export function parseAttributes(tag) {
  const attrs = {};
  const re = /([A-Za-z_:][-A-Za-z0-9_:.]*)="([^"]*)"/g;
  let match;
  while ((match = re.exec(tag))) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

/** Classifica o contentType a partir do AdaptationSet/mimeType. */
export function resolveContentType(adaptationAttrs, mimeType = '') {
  const contentType = adaptationAttrs.contentType || '';
  if (contentType) return contentType;
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'unknown';
}

const ISO8601_DURATION_RE =
  /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;

/**
 * Converte `mediaPresentationDuration` (ISO 8601, ex.: `PT1M2.5S`) em segundos.
 * Retorna 0 quando ausente ou invalido.
 */
export function parseIso8601Duration(value) {
  const text = String(value || '').trim();
  const match = ISO8601_DURATION_RE.exec(text);
  if (!match) return 0;

  const [, days, hours, minutes, seconds] = match;
  const secondsTotal =
    (Number(days) || 0) * 86400 + (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60 + (Number(seconds) || 0);
  return Number.isFinite(secondsTotal) ? secondsTotal : 0;
}