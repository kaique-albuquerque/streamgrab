/** Respostas que claramente nao sao midia. */
const NOT_MEDIA_CONTENT_TYPES = [/^text\/html\b/i, /^application\/json\b/i];

export function looksLikeHtml(text) {
  const t = String(text || '').trimStart();
  return /^<!doctype html/i.test(t) || /^<html[\s>/]/i.test(t);
}

export function looksLikeJson(text) {
  const t = String(text || '').trimStart();
  return t.startsWith('{') || t.startsWith('[');
}

/**
 * Detecta se a resposta parece HTML/JSON em vez de midia binaria.
 * @param {string} contentType — header Content-Type (pode ser vazio).
 * @param {string} [bodySample] — primeiros bytes como texto (opcional).
 */
export function isNotMediaResponse(contentType, bodySample) {
  if (contentType) {
    for (const re of NOT_MEDIA_CONTENT_TYPES) {
      if (re.test(contentType)) return true;
    }
  }
  if (bodySample && (looksLikeHtml(bodySample) || looksLikeJson(bodySample))) return true;
  return false;
}
