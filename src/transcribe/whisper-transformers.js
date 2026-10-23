/**
 * Fallback: transcricao via @xenova/transformers (barrel).
 *
 * Implementação em ./whisper-transformers/:
 *  - model.js    → checkTransformers, cache do pipeline, formatElapsed
 *  - segments.js → extractSegments
 *  - index.js    → transcribeWithTransformers
 */

export { transcribeWithTransformers } from './whisper-transformers/index.js';
export { checkTransformers } from './whisper-transformers/model.js';
export { transcribeWithTransformers as default } from './whisper-transformers/index.js';
