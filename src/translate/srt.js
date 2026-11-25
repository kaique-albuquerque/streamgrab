/**
 * Parse e reconstrução de SRT para tradução local (barrel).
 *
 * Implementação em ./srt/:
 *  - parse.js → parseSrt (preserva timing, BOM e EOL)
 *  - build.js → buildSrt (reconstrói byte a byte)
 */

export { parseSrt } from './srt/parse.js';
export { buildSrt } from './srt/build.js';