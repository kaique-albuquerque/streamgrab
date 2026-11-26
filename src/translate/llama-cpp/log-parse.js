/**
 * Parsing do log do `llama-server`.
 *
 * A linha de escuta é `listening on http://127.0.0.1:57815`. A regex precisa
 * ancorar no `:` final para não capturar o `127` do IP.
 */

/**
 * Extrai a porta de uma linha de log do `llama-server`.
 *
 * @param {string} chunk - Linha de log
 * @returns {number} Porta, ou 0 quando não há
 */
export function parsePortFromLog(chunk) {
  const text = String(chunk || '');
  // `listening on <host>:<port>` — captura o número depois do último `:`.
  const listening = /listening\s+on\s+\S+:(\d{2,5})/i.exec(text);
  if (listening) return Number(listening[1]);
  // Fallback: `port N`.
  const port = /\bport\s+(\d{2,5})\b/i.exec(text);
  return port ? Number(port[1]) : 0;
}