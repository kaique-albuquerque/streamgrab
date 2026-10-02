/**
 * Extração de áudio para transcrição.
 *
 * Extrai áudio de um vídeo em formato WAV 16kHz mono (ideal para Whisper).
 * Usa o FfmpegService existente para consistência com o resto do projeto.
 *
 * Uso:
 *   const { audioPath, cleanup } = await extractAudio({ videoPath });
 *   // ... usar audioPath ...
 *   await cleanup(); // limpar arquivo temporário
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ffmpegService } from '../ffmpeg/service.js';

/**
 * Extrai áudio de um vídeo para WAV 16kHz mono.
 *
 * @param {object} params
 * @param {string} params.videoPath — Caminho do vídeo de entrada
 * @param {string} [params.outputDir] — Diretório para arquivo temporário (default: os.tmpdir())
 * @param {AbortSignal} [params.signal] — Sinal de cancelamento
 * @param {Function} [params.onLog] — Callback para mensagens de log
 * @returns {Promise<{ audioPath: string, cleanup: () => Promise<void> }>}
 * @throws {Error} Se o vídeo não existir ou não tiver áudio
 */
export async function extractAudio({ videoPath, outputDir, signal, onLog }) {
  if (!videoPath || !fs.existsSync(videoPath)) {
    throw new Error(`Arquivo de vídeo não encontrado: ${videoPath}`);
  }

  const tmpDir = outputDir || fs.mkdtempSync(path.join(os.tmpdir(), 'sg-audio-'));
  const audioPath = path.join(tmpDir, `audio_${Date.now()}.wav`);

  onLog?.(`[audio-extract] Extraindo áudio de: ${path.basename(videoPath)}`);

  try {
    // Comando FFmpeg para extrair áudio WAV 16kHz mono
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-nostats',
      '-y', // Sobrescrever se existir
      '-i', videoPath,
      '-vn', // Sem vídeo
      '-acodec', 'pcm_s16le', // PCM 16-bit (formato nativo do Whisper)
      '-ar', '16000', // 16kHz (padrão Whisper)
      '-ac', '1', // Mono
      audioPath,
    ];

    // ffmpegService.run() retorna { promise, stop, child }
    const { promise } = ffmpegService.run({ args, signal });
    const result = await promise;

    if (!result.ok) {
      throw new Error(result.error || result.stderr || 'Falha na extração de áudio');
    }

    // Verificar se o arquivo foi gerado
    if (!fs.existsSync(audioPath)) {
      throw new Error('Arquivo de áudio não foi gerado pelo FFmpeg');
    }

    const stat = fs.statSync(audioPath);
    if (stat.size === 0) {
      throw new Error('Arquivo de áudio gerado está vazio (vídeo pode não ter áudio)');
    }

    onLog?.(`[audio-extract] Áudio extraído: ${formatSize(stat.size)}`);

    // Função de limpeza
    const cleanup = async () => {
      try {
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
          onLog?.(`[audio-extract] Arquivo temporário removido: ${path.basename(audioPath)}`);
        }
        // Tentar remover o diretório temporário se estiver vazio
        if (tmpDir !== outputDir && fs.existsSync(tmpDir)) {
          const remaining = fs.readdirSync(tmpDir);
          if (remaining.length === 0) {
            fs.rmdirSync(tmpDir);
          }
        }
      } catch (err) {
        onLog?.(`[audio-extract] Aviso: falha ao limpar temporário: ${err.message}`);
      }
    };

    return { audioPath, cleanup };
  } catch (err) {
    // Limpar arquivo parcial em caso de erro
    cleanupFileSync(audioPath);
    throw err;
  }
}

/**
 * Verifica se um arquivo de vídeo tem áudio.
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
 * Obtém a duração do áudio em segundos.
 *
 * @param {string} audioPath — Caminho do arquivo de áudio/vídeo
 * @returns {Promise<number>} Duração em segundos, ou 0 se não conseguir detectar
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

// ---------------------------------------------------------------------------
// Funções auxiliares
// ---------------------------------------------------------------------------

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
