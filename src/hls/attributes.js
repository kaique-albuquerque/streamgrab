/**
 * Interpreta a lista de atributos de uma linha #EXT-X-STREAM-INF,
 * respeitando valores entre aspas que podem conter vírgulas
 * (ex.: CODECS="avc1.640028,mp4a.40.2").
 */
export function parseAttributes(str) {
  const attrs = {};
  const s = String(str ?? '');
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /[\s,]/.test(s[i])) i++;
    if (i >= s.length) break;
    let name = '';
    while (i < s.length && s[i] !== '=') name += s[i++];
    i++; // pula o '='
    let value = '';
    if (s[i] === '"') {
      i++;
      while (i < s.length && s[i] !== '"') value += s[i++];
      i++; // pula a aspa final
    } else {
      while (i < s.length && s[i] !== ',' && !/\s/.test(s[i])) value += s[i++];
    }
    attrs[name.trim()] = value;
  }
  return attrs;
}
