/** API pública do pacote FFmpeg (barrel interno). */

import { FfmpegService } from './run.js';

export { checkFfmpeg } from './check.js';
export { getFfmpegCommand } from './paths.js';
export { FfmpegService } from './run.js';

/** Instância padrão compartilhada (spawn real). */
export const ffmpegService = new FfmpegService();
