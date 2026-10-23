/**
 * Extracao de audio de um video para WAV 16kHz mono (ideal para Whisper).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ffmpegService } from '../../ffmpeg/service.js';
import { cleanupFileSync, formatSize, makeCleanup } from './fs-helpers.js';
import { getAudioDuration } from './probe.js';
import { parseFfmpegProgressSeconds } from './progress.js';

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

    const cleanup = makeCleanup({ audioPath, tmpDir, outputDir, onLog });
    return { audioPath, cleanup };
  } catch (err) {
    cleanupFileSync(audioPath);
    throw err;
  }
}
