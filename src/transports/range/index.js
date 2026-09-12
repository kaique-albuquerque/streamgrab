/**
 * P4 — Transporte Range: download paralelo por partes.
 */

export { probeRangeSupport, normalizeBlockCount, computeRanges, DEFAULT_RANGE_CHUNKS, DEFAULT_RANGE_BLOCK_MULTIPLIER } from './probe.js';
export { fetchChunk } from './chunk.js';
export { downloadParallelRanges } from './download.js';

import { downloadParallelRanges } from './download.js';
import { probeRangeSupport } from './probe.js';
import { DEFAULT_RANGE_CHUNKS } from './probe.js';

export default { downloadParallelRanges, probeRangeSupport, DEFAULT_RANGE_CHUNKS };
