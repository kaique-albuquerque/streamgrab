/**
 * Verificação de saúde do `llama-server`.
 */

/**
 * GET `/health` com a api-key.
 *
 * @param {typeof fetch} fetchImpl
 * @param {number} port
 * @param {string} apiKey
 * @returns {Promise<boolean>} true quando responde 200
 */
export async function pingHealth(fetchImpl, port, apiKey) {
  try {
    const res = await fetchImpl(`http://127.0.0.1:${port}/health`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    return res.status === 200;
  } catch {
    return false;
  }
}
