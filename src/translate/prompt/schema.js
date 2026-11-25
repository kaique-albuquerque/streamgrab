/**
 * Schema JSON e prompts do tradutor.
 *
 * O `response_format: json_schema` impede o modelo de devolver algo fora do
 * formato pedido — o schema tem chaves variáveis (um índice por cue), então
 * `additionalProperties` é o que garante tipagem.
 */

/** Nome do schema enviado ao llama-server. */
export const SCHEMA_NAME = 'translated_subtitles';

/**
 * Schema da resposta: objeto com uma chave por índice de cue.
 *
 * @returns {object} JSON schema
 */
export function buildSchema() {
  return {
    type: 'object',
    additionalProperties: { type: 'string' },
  };
}

/**
 * System prompt: instrui a tradução condensada com o alvo de leitura.
 *
 * @param {object} params
 * @param {string} params.targetLang - Idioma de destino (ex.: 'pt')
 * @param {number} params.charsPerSecond - Alvo de caracteres por segundo
 * @returns {string} System prompt
 */
export function buildSystemPrompt({ targetLang = 'pt', charsPerSecond = 17 } = {}) {
  return [
    `Você é um tradutor profissional de legendas. Traduza do inglês para ${targetLang}.`,
    `Regras: mantenha nomes próprios, gírias e pronomes coerentes com o contexto do bloco.`,
    `Cada legenda deve caber no tempo de leitura: no máximo ${charsPerSecond} caracteres por segundo de duração.`,
    `Se a tradução fiel estourar o alvo, condense dizendo a mesma coisa com menos caracteres — nunca trunque.`,
    `Responda APENAS um objeto JSON com uma chave por índice recebido, ex.: {"12": "texto", "13": "texto"}.`,
  ].join(' ');
}

/**
 * User prompt: lista `índice | segundos | texto` e pede o JSON.
 *
 * @param {Array} cues - Cues do bloco (com `lines`)
 * @returns {string} User prompt
 */
export function buildUserPrompt(cues) {
  const lines = cues.map((cue) => {
    const seconds = Math.max(1, (cue.endMs - cue.startMs) / 1000);
    const text = (cue.lines || []).join(' ').trim();
    return `${cue.index} | ${seconds.toFixed(1)}s | ${text}`;
  });
  return ['Traduza os itens abaixo. Responda só o JSON.', ...lines].join('\n');
}