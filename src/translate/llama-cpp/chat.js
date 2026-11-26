/**
 * Cliente de chat com JSON schema (`/v1/chat/completions`).
 *
 * Usa `response_format: json_schema` para que o modelo seja gramaticalmente
 * impedido de devolver algo fora do formato pedido — elimina a maior fonte de
 * retrabalho de parsing.
 */

/** Erro de resposta inválida do chat (JSON ausente, inválido ou status != 2xx). */
export class ChatJsonError extends Error {
  /**
   * @param {string} message
   * @param {object} [details]
   * @param {number} [details.status] - HTTP status, quando aplicável
   * @param {string} [details.raw] - Trecho bruto da resposta (diagnóstico)
   */
  constructor(message, { status, raw } = {}) {
    super(message);
    this.name = 'ChatJsonError';
    this.status = status;
    this.raw = raw;
  }
}

/** Parâmetros de amostragem fixos (tradução determinística o quanto possível). */
const SAMPLING = {
  temperature: 0.2,
  top_p: 0.9,
  max_tokens: 4096,
  stream: false,
};

/**
 * Envia um prompt e devolve o objeto JSON da resposta.
 *
 * @param {object} params
 * @param {string} params.baseUrl - Base do `llama-server` (ex.: http://127.0.0.1:1234)
 * @param {string} params.apiKey - Chave da sessão
 * @param {string} params.system - System prompt
 * @param {string} params.user - User prompt
 * @param {object} params.schema - JSON schema da resposta
 * @param {AbortSignal} [params.signal]
 * @param {typeof fetch} [params.fetchImpl]
 * @returns {Promise<object>} Objeto JSON (não-array)
 */
export async function chatJson({
  baseUrl,
  apiKey,
  system,
  user,
  schema,
  signal,
  fetchImpl = globalThis.fetch,
} = {}) {
  const response = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      ...SAMPLING,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'translated_subtitles', strict: true, schema },
      },
    }),
    signal,
  });

  if (!response.ok) {
    const raw = await safeText(response);
    throw new ChatJsonError(`llama-server respondeu HTTP ${response.status}`, { status: response.status, raw });
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new ChatJsonError('Resposta do llama-server sem conteúdo.', { raw: JSON.stringify(payload).slice(0, 500) });
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ChatJsonError('Conteúdo da resposta não é JSON válido.', { raw: content.slice(0, 500) });
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ChatJsonError('Resposta JSON não é um objeto.', { raw: content.slice(0, 500) });
  }

  return parsed;
}

/** Lê o corpo como texto sem derrubar em respostas sem corpo. */
async function safeText(response) {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '';
  }
}