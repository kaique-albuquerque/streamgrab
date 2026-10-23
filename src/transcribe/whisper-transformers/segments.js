/**
 * Extração de segmentos do resultado do pipeline.
 */

/**
 * Extrai segmentos do resultado do transformers.
 *
 * @param {object} result - Resultado do pipeline
 * @returns {Array<{ index: number, startMs: number, endMs: number, text: string }>}
 */
export function extractSegments(result) {
  const segments = [];

  if (result.chunks && Array.isArray(result.chunks)) {
    for (let i = 0; i < result.chunks.length; i++) {
      const chunk = result.chunks[i];
      segments.push({
        index: i + 1,
        startMs: Math.round((chunk.timestamp?.[0] || 0) * 1000),
        endMs: Math.round((chunk.timestamp?.[1] || 0) * 1000),
        text: chunk.text || '',
      });
    }
  }

  return segments;
}
