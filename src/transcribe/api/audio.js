/**
 * Transcrição de um arquivo de áudio (auto-detect do engine).
 */

import { checkWhisperCpp, transcribeWithCpp } from '../whisper-cpp.js';
import { checkTransformers, transcribeWithTransformers } from '../whisper-transformers.js';
import { DEFAULT_MODEL } from '../model-manager.js';

/**
 * Transcreve um arquivo de audio.
 *
 * @param {object} params
 * @param {string} params.audioPath - Caminho do arquivo de audio (WAV 16kHz mono)
 * @param {string} [params.language='pt'] - Codigo do idioma
 * @param {string} [params.model='small'] - Id do modelo no catalogo
 * @param {AbortSignal} [params.signal] - Sinal de cancelamento
 * @param {Function} [params.onProgress] - Callback de progresso
 * @param {Function} [params.onLog] - Callback de log
 * @returns {Promise<{ text: string, segments: Array, engine: string, durationMs: number }>}
 */
export async function transcribeAudio({
  audioPath,
  language = 'pt',
  model = DEFAULT_MODEL,
  signal,
  onProgress,
  onLog,
}) {
  onLog?.(`[transcribe] Engine: auto-detect, modelo: ${model}`);

  const cpp = checkWhisperCpp();
  if (cpp.available) {
    onLog?.(`[transcribe] Usando whisper.cpp`);
    const result = await transcribeWithCpp({
      audioPath,
      language,
      model,
      signal,
      onProgress,
      onLog,
    });
    return { ...result, engine: 'whisper-cpp' };
  }

  const transformers = await checkTransformers();
  if (transformers) {
    onLog?.(`[transcribe] Usando @xenova/transformers (fallback)`);
    const result = await transcribeWithTransformers({
      audioPath,
      language,
      model,
      signal,
      onProgress,
      onLog,
    });
    return { ...result, engine: 'whisper-transformers' };
  }

  throw new Error(
    'Nenhum engine de transcricao encontrado.\n' +
    'Execute: npm run whisper:install\n' +
    'Ou: npm install @xenova/transformers'
  );
}
