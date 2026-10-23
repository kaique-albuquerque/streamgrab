/** Saida .md: paragrafos por minuto com timestamps. */

import { cleanSegmentText } from './text-utils.js';
import { formatTimestamp } from './times.js';

/**
 * Gera Markdown com timestamps.
 *
 * @param {object} params
 * @param {Array} params.segments - Segmentos da transcricao
 * @param {string} [params.title] - Titulo do documento
 * @returns {string} Markdown formatado
 */
export function formatMd({ segments, title }) {
  const lines = [];
  if (title) {
    lines.push(`# ${title}`);
    lines.push('');
  }

  if (!segments || segments.length === 0) {
    lines.push('*Nenhum segmento com timestamps disponivel.*');
    return lines.join('\n') + '\n';
  }

  let lastParagraph = [];
  let lastMinute = -1;

  for (const segment of segments) {
    const timestamp = formatTimestamp(segment.startMs);
    const minute = Math.floor((segment.startMs || 0) / 60000);
    const text = cleanSegmentText(segment.text);

    if (!text) continue;

    if (minute !== lastMinute && lastParagraph.length > 0) {
      lines.push(`**[${lastParagraph[0].timestamp}]** ${lastParagraph.map((s) => s.text).join(' ')}`);
      lines.push('');
      lastParagraph = [];
    }

    lastParagraph.push({ timestamp, text });
    lastMinute = minute;
  }

  if (lastParagraph.length > 0) {
    lines.push(`**[${lastParagraph[0].timestamp}]** ${lastParagraph.map((s) => s.text).join(' ')}`);
  }

  return lines.join('\n').trim() + '\n';
}
