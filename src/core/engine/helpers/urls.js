import { maskUrl } from '../../../utils.js';

/**
 * Re-resolve a variante escolhida (selectedUrl) contra a analise mais recente
 * (variantes do master HLS). Os tokens de sessao do mdstrm mudam a cada
 * analise: o selectedUrl vindo da UI pode estar com tokens expirados quando o
 * engine roda (o renderer analisa, o usuario escolhe qualidade e enfileira —
 * e o engine RE-analisa a URL do player, obtendo tokens frescos). O match e
 * por pathname (estavel entre refreshes), nunca por query string.
 * Retorna a URL absoluta fresca, ou null se nenhuma variante casar.
 */
export function resolveFreshVariant(selectedUrl, variants, baseUrl = '') {
  let selectedPath = null;
  try {
    selectedPath = new URL(selectedUrl).pathname;
  } catch {
    return null;
  }
  for (const variant of variants || []) {
    const uri = variant?.uri || variant?.url;
    if (!uri) continue;
    try {
      const absolute = new URL(uri, baseUrl || selectedUrl).toString();
      if (new URL(absolute).pathname === selectedPath) return absolute;
    } catch {
      /* ignora variante invalida */
    }
  }
  return null;
}

/**
 * Mascara uma URL para diagnostico: alem dos parametros sensiveis do
 * maskUrl (access_token/sid/uid/token), oculta `ot` (one-time token do CDN
 * mdstrm, usado para autorizar a sessao). NUNCA logar tokens completos.
 */
export function maskDiagUrl(value) {
  const masked = maskUrl(value);
  try {
    const u = new URL(masked);
    if (u.searchParams.has('ot')) u.searchParams.set('ot', '***');
    return u.toString();
  } catch {
    return masked;
  }
}

export function safePathname(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

export function isMdstrmPlayerUrl(url) {
  return /^https?:\/\/mdstrm\.com\/video\/[a-f0-9]+\.m3u8/i.test(String(url || ''));
}
