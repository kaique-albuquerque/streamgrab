/**
 * Extracao de audio para transcricao.
 *
 * Extrai audio de um video em formato WAV 16kHz mono (ideal para Whisper).
 * Usa o FfmpegService existente para consistencia com o resto do projeto.
 *
 * Uso:
 *   const { audioPath, cleanup } = await extractAudio({ videoPath });
 *   await cleanup(); // limpar arquivo temporario
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ffmpegService } from '../ffmpeg/service.js';

/**
 * Extrai audio de um video para WAV 16kHz mono.
 *
 * @param {object} params
 * @param {string} params.videoPath - Caminho do video de entrada
 * @param {string} [params.outputDir] - Diretorio para arquivo temporario
 * @param {AbortSignal} [params.signal] - Sinal de cancelamento
 * @param {Function} [params.onLog] - Callback para mensagens de log
 * @param {Function} [params.onProgress] - Callback de progresso
 * @returns {Promise<{ audioPath: string, cleanup: () => Promise<void> }>}
 * @throws {Error} Se o video nao existir ou nao tiver audio
 */
export async function extractAudio({ videoPath, outputDir, signal, onLog, onProgress }) {
  if (!videoPath || !fs.existsSync(videoPath)) {
    throw new Error(`Arquivo de video nao encontrado: ${videoPath}`);
  }

  const tmpDir = outputDir || fs.mkdtempSync(path.join(os.tmpdir(), 'sg-audio-'));
  const audioPath = path.join(tmpDir, `audio_${Date.now()}.wav`);

  onLog?.(`[audio-extract] Extraindo audio de: ${path.basename(videoPath)}`);

  try {
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-i', videoPath,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '16000',
      '-ac', '1',
      '-progress', 'pipe:1',
      '-nostats',
      audioPath,
    ];

    const durationSeconds = await getAudioDuration(videoPath);
    let lastPercent = 0;
    onProgress?.({
      stage: 'extracting',
      percent: 0,
      elapsed: 0,
      total: durationSeconds,
    });
    const { promise } = ffmpegService.run({
      args,
      signal,
      onProgress: ({ key, value }) => {
        if (!durationSeconds) return;

        const elapsedSeconds = parseFfmpegProgressSeconds(key, value);
        if (!Number.isFinite(elapsedSeconds)) return;

        const percent = Math.max(0, Math.min(100, Math.round((elapsedSeconds / durationSeconds) * 100)));
        if (percent > lastPercent || percent === 100) {
          lastPercent = percent;
          onProgress?.({
            stage: 'extracting',
            percent,
            elapsed: elapsedSeconds,
            total: durationSeconds,
          });
        }
      },
    });
    const result = await promise;

    if (!result.ok) {
      throw new Error(result.error || result.stderr || 'Falha na extracao de audio');
    }

    onProgress?.({
      stage: 'extracting',
      percent: 100,
      elapsed: durationSeconds,
      total: durationSeconds,
    });

    if (!fs.existsSync(audioPath)) {
      throw new Error('Arquivo de audio nao foi gerado pelo FFmpeg');
    }

    const stat = fs.statSync(audioPath);
    if (stat.size === 0) {
      throw new Error('Arquivo de audio gerado esta vazio (video pode nao ter audio)');
    }

    onLog?.(`[audio-extract] Audio extraido: ${formatSize(stat.size)}`);

    const cleanup = async () => {
      try {
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
          onLog?.(`[audio-extract] Arquivo temporario removido: ${path.basename(audioPath)}`);
        }
        if (tmpDir !== outputDir && fs.existsSync(tmpDir)) {
          const remaining = fs.readdirSync(tmpDir);
          if (remaining.length === 0) {
            fs.rmdirSync(tmpDir);
          }
        }
      } catch (err) {
        onLog?.(`[audio-extract] AVISO: falha ao limpar temporario: ${err.message}`);
      }
    };

    return { audioPath, cleanup };
  } catch (err) {
    cleanupFileSync(audioPath);
    throw err;
  }
}

function parseFfmpegProgressSeconds(key, value) {
  if (key === 'out_time_ms' || key === 'out_time_us') {
    return Number(value) / 1_000_000;
  }

  if (key === 'out_time') {
    return parseTimeToSeconds(value);
  }

  return NaN;
}

function parseTimeToSeconds(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return NaN;

  const [time, fraction = '0'] = timeStr.split('.');
  const parts = time.split(':').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return NaN;
  }

  const [hours, minutes, seconds] = parts;
  return (hours * 3600) + (minutes * 60) + seconds + (Number(`0.${fraction}`) || 0);
}

/**
 * Verifica se um arquivo de video tem audio.
 *
 * @param {string} videoPath
 * @returns {Promise<boolean>}
 */
export async function hasAudio(videoPath) {
  try {
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-show_streams',
      '-select_streams', 'a',
      '-of', 'csv=p=0',
      videoPath,
    ];

    const result = ffmpegService.runProbe(args);
    return result.ok && result.stdout && result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Obtem a duracao do audio em segundos.
 *
 * @param {string} audioPath - Caminho do arquivo de audio/video
 * @returns {Promise<number>} Duracao em segundos, ou 0 se nao conseguir detectar
 */
export async function getAudioDuration(audioPath) {
  try {
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      audioPath,
    ];

    const result = ffmpegService.runProbe(args);
    if (result.ok && result.stdout) {
      const duration = parseFloat(result.stdout.trim());
      if (Number.isFinite(duration) && duration > 0) {
        return duration;
      }
    }
  } catch {
    // Ignorar erros
  }
  return 0;
}

function cleanupFileSync(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignorar erros de limpeza
  }
}

function formatSize(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

export default extractAudio;
