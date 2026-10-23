/**
 * Sondagem de mídia via FFmpeg (áudio presente / duração).
 */

import { ffmpegService } from '../../ffmpeg/service.js';

/**
 * Verifica se um arquivo de video tem audio.
 *
 * Usa o proprio ffmpeg (`-i` imprime as streams no stderr): o ffmpegService
 * nao possui runProbe — o codigo anterior chamava um metodo inexistente e
 * retornava false sempre.
 *
 * @param {string} videoPath
 * @returns {Promise<boolean>}
 */
export async function hasAudio(videoPath) {
  try {
    const { promise } = ffmpegService.run({
      args: ['-hide_banner', '-i', videoPath],
    });
    const result = await promise;
    return /Stream #.*Audio:/i.test(result.stderr || '');
  } catch {
    return false;
  }
}

/**
 * Obtem a duracao do audio em segundos.
 *
 * Usa o proprio ffmpeg: `ffmpeg -i <arquivo>` imprime
 * "Duration: HH:MM:SS.xx" no stderr antes de sair (codigo 1, sem saida).
 * Sem isso, o progresso da extracao nao e emitido (total = 0).
 *
 * @param {string} audioPath - Caminho do arquivo de audio/video
 * @returns {Promise<number>} Duracao em segundos, ou 0 se nao conseguir detectar
 */
export async function getAudioDuration(audioPath) {
  try {
    const { promise } = ffmpegService.run({
      args: ['-hide_banner', '-i', audioPath],
    });
    const result = await promise;
    const text = `${result.stderr || ''}\n${result.stdout || ''}`;
    const match = text.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{2})/);
    if (match) {
      const [, hours, minutes, seconds, centis] = match;
      const duration = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(centis) / 100;
      if (Number.isFinite(duration) && duration > 0) {
        return duration;
      }
    }
  } catch {
    // Ignorar erros
  }
  return 0;
}
