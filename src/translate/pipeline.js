/**
 * Pipeline de tradução: bloco → LLM → segundo passe de encurtamento.
 *
 * Não escreve arquivo: recebe os cues, devolve os cues com `translatedLines` e
 * a lista de índices que continuaram acima do alvo.
 */

import { toBlocks } from './prompt/blocks.js';
import { buildSchema, buildSystemPrompt, buildUserPrompt } from './prompt/schema.js';
import { overTarget } from './prompt/measure.js';
import { assertAllIndices } from './validate.js';

/** Prompt do segundo passe (encurtamento). */
const SHORTEN_HINT = 'encurte';

/**
 * Traduz os cues.
 *
 * @param {object} params
 * @param {Array} params.cues - Cues do `parseSrt`
 * @param {object} params.doc - Documento do `parseSrt` (não usado, mas mantido
 *   para o chamador ter o contexto completo)
 * @param {Function} params.chat - `chat({ system, user, schema })` → objeto
 * @param {number} [params.charsPerSecond=17] - Alvo de leitura
 * @param {Function} [params.onProgress]
 * @param {Function} [params.onLog]
 * @returns {Promise<{ cues: Array, overTarget: number[] }>}
 */
export async function translateSrt({
  cues,
  doc: _doc,
  chat,
  charsPerSecond = 17,
  onProgress,
  onLog,
}) {
  const blocks = toBlocks(cues);
  const totalBlocks = blocks.length;
  const translated = {};

  const system = buildSystemPrompt({ targetLang: 'pt', charsPerSecond });
  const schema = buildSchema();

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    onLog?.(`[translate] Bloco ${i + 1}/${totalBlocks} (${block.length} segmentos)`);
    const response = await chat({ system, user: buildUserPrompt(block), schema });
    assertAllIndices(block, response);
    Object.assign(translated, response);
    onProgress?.({
      stage: 'translating',
      block: i + 1,
      totalBlocks,
      percent: Math.round(((i + 1) / totalBlocks) * 100),
    });
  }

  let over = overTarget(cues, translated, charsPerSecond);

  if (over.length) {
    onLog?.(`[translate] ${over.length} segmento(s) acima do alvo — encurtando`);
    const subset = cues.filter((cue) => over.includes(cue.index));
    const shortenSystem = `${system} Agora ${SHORTEN_HINT} as legendas abaixo sem perder o sentido.`;
    const response = await chat({ system: shortenSystem, user: buildUserPrompt(subset), schema });
    assertAllIndices(subset, response);
    Object.assign(translated, response);
    onProgress?.({ stage: 'shortening', block: 1, totalBlocks: 1, percent: 100 });
    over = overTarget(cues, translated, charsPerSecond);
  }

  const outCues = cues.map((cue) => ({
    ...cue,
    translatedLines: String(translated[cue.index] ?? '').split('\n'),
  }));

  return { cues: outCues, overTarget: over };
}