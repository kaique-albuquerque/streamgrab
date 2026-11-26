/**
 * Args do FFmpeg para converter um vídeo para MKV.
 *
 * Remux (`-c copy`): h264/aac são compatíveis com Matroska, então não há
 * re-encode — a conversão leva 1-2 s por hora de vídeo e não perde qualidade.
 * `-map 0` preserva todas as faixas (vídeo, áudio, legendas).
 */

/**
 * Monta os args do remux.
 *
 * @param {object} params
 * @param {string} params.input - Arquivo de entrada
 * @param {string} params.output - Arquivo de saída (.mkv)
 * @returns {string[]} Args do FFmpeg (argv, sem shell)
 */
export function buildRemuxArgs({ input, output }) {
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostats',
    '-y',
    '-i', input,
    '-map', '0',
    '-c', 'copy',
    '-progress', 'pipe:1',
    output,
  ];
}