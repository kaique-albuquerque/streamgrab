/**
 * Blocos, prompts e medição de leitura da tradução (barrel).
 *
 * Implementação em ./prompt/:
 *  - blocks.js  → BLOCK_SIZE, toBlocks
 *  - schema.js  → buildSchema, buildSystemPrompt, buildUserPrompt
 *  - measure.js → charsPerSecondOf, overTarget
 */

export { BLOCK_SIZE, toBlocks } from './prompt/blocks.js';
export { buildSchema, buildSystemPrompt, buildUserPrompt, SCHEMA_NAME } from './prompt/schema.js';
export { charsPerSecondOf, overTarget } from './prompt/measure.js';