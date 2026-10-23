/**
 * Formatacao de saida da transcricao.
 *
 * Converte o resultado do Whisper em arquivos de saida formatados:
 * - .txt: Texto puro (ideal para NotebookLM)
 * - .md: Texto com timestamps (para referencia)
 * - .srt: Legendas SRT
 *
 * A implementacao vive em ./format/ (um modulo por responsabilidade).
 */

import { writeTranscription } from './format/write.js';

export { formatTxt } from './format/txt.js';
export { formatMd } from './format/md.js';
export { formatSrt } from './format/srt.js';
export { writeTranscription } from './format/write.js';
export { titleFromVideoPath } from './format/title.js';

export default writeTranscription;
