/**
 * YouTube — HTML/JSON parsing helpers.
 */

/**
 * Extracts a JSON object assigned to a variable in YouTube page source.
 * e.g. `var ytInitialPlayerResponse = { ... }`
 */
export function parseJsonAssignment(text, variableName) {
  const needle = `${variableName} = `;
  const start = text.indexOf(needle);
  if (start === -1) return null;

  let i = start + needle.length;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== '{') return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  const begin = i;

  for (; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(begin, i + 1);
    }
  }
  return null;
}

/**
 * Extracts a JSON object starting at the given index in a string.
 */
export function parseJsonObjectAt(text, startIndex) {
  let i = startIndex;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== '{') return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  const begin = i;

  for (; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(begin, i + 1);
    }
  }
  return null;
}

/**
 * Parses a MIME type string into container and codecs.
 */
export function parseMimeType(format) {
  const mime = String(format?.mimeType || '');
  const container = mime.match(/^[^/]+\/([a-z0-9]+)/i)?.[1] || '';
  const codecs = mime.match(/codecs="([^"]+)"/i)?.[1] || '';
  return { mime, container, codecs };
}
