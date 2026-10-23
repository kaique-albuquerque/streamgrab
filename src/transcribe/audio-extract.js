/**
 * Extracao de audio para transcricao — barrel.
 *
 * Extrai audio de um video em formato WAV 16kHz mono (ideal para Whisper).
 * Usa o FfmpegService existente para consistencia com o resto do projeto.
 *
 * A implementação vive em `./audio-extract/*`, uma responsabilidade por arquivo.
 *
 * Uso:
 *   const { audioPath, cleanup } = await extractAudio({ videoPath });
 *   await cleanup(); // limpar arquivo temporario
 */

export { extractAudio } from './audio-extract/extract.js';
export { hasAudio, getAudioDuration } from './audio-extract/probe.js';

export { extractAudio as default } from './audio-extract/extract.js';
