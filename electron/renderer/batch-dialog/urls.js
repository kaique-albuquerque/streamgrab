export const MAX_BATCH_URLS = 100;

/** Extrai URLs de um texto livre (linhas, vírgulas, espaços). */
export function parseBatchUrls(rawText) {
  if (typeof rawText !== 'string') return [];
  const seen = new Set();
  const out = [];
  for (const chunk of rawText.split(/[\n\r,;\s]+/)) {
    const url = chunk.trim();
    if (!url) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}
