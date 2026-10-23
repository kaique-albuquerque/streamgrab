// ---------------------------------------------------------------------------
// Segment checkpoint — geração de IDs de segmento.
// ---------------------------------------------------------------------------

/**
 * Gera um ID de segmento unico no formato:
 * stream:representationId:init|seg:index
 */
export function createSegmentTaskId({
  stream = 'video',
  representationId = '',
  segmentIndex = 0,
  init = false,
} = {}) {
  const normalizedStream = String(stream || 'video').trim().toLowerCase() || 'video';
  const normalizedRepresentation = String(representationId || '').trim() || 'default';
  const normalizedIndex = Number.isFinite(Number(segmentIndex)) ? Number(segmentIndex) : 0;
  const kind = init ? 'init' : 'seg';
  return `${normalizedStream}:${normalizedRepresentation}:${kind}:${normalizedIndex}`;
}
