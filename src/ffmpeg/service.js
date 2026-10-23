/**
 * P5 — FfmpegService (barrel).
 *
 * Centraliza a interação com o FFmpeg:
 *  - detecção do binário (vendor/ffmpeg ou PATH) → ./service/paths.js
 *  - verificação de disponibilidade → ./service/check.js
 *  - execução de processos, progresso, cancelamento → ./service/run.js
 *
 * Nenhum comando específico de remux/mux/áudio mora aqui — isso é
 * responsabilidade de muxer.js/audio.js (evita duplicação de comandos FFmpeg
 * entre providers, seção 20 do architect.md).
 */

export { checkFfmpeg } from './service/check.js';
export { getFfmpegCommand } from './service/paths.js';
export { FfmpegService, ffmpegService } from './service/index.js';
