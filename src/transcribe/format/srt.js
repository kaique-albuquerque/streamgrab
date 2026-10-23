/** Saida .srt: legendas. */

import { cleanSegmentText } from './text-utils.js';
import { formatSrtTime } from './times.js';

/**
 * Gera SRT a partir dos segmentos.
 *
 * @param {object} params
 * @param {Array} params.segments - Segmentos da transcricao
 * @returns {string} Conteudo SRT
 */
export function formatSrt({ segments }) {
  if (!segments || segments.length === 0) return '';

  const lines = [];
  for (const segment of segments) {
    lines.push(String(segment.index));
    lines.push(`${formatSrtTime(segment.startMs)} --> ${formatSrtTime(segment.endMs)}`);
    lines.push(cleanSegmentText(segment.text));
    lines.push('');
  }
  return lines.join('\n').trim() + '\n';
}
