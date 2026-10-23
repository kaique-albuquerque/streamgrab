/** Saida .txt: texto puro (ideal para NotebookLM). */

import { cleanTranscriptionText } from './text-utils.js';

/**
 * Gera texto puro formatado.
 *
 * @param {object} params
 * @param {string} params.text - Texto bruto da transcricao
 * @param {string} [params.title] - Titulo do documento
 * @returns {string} Texto formatado
 */
export function formatTxt({ text, title }) {
  const lines = [];
  if (title) {
    lines.push(title);
    lines.push('');
  }

  const cleanText = cleanTranscriptionText(text);
  lines.push(cleanText);
  return lines.join('\n').trim() + '\n';
}
