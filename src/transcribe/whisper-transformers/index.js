/**
 * Fallback: transcricao via @xenova/transformers (Node.js puro).
 *
 * Usa o pacote @xenova/transformers para transcrever audio sem
 * necessidade de binario externo (whisper.cpp). Mais lento que
 * o whisper.cpp, mas funciona em qualquer ambiente com Node.js.
 */

import fs from 'node:fs';

import {
  checkTransformers,
  formatElapsed,
  loadTranscriber,
  resetTranscriberCache,
  resolveModelId,
} from './model.js';
import { extractSegments } from './segments.js';

/**
 * Transcreve audio usando @xenova/transformers.
 *
 * @param {object} params
 * @param {string} params.audioPath - Caminho do arquivo de audio
 * @param {string} [params.language='pt'] - Codigo do idioma
 * @param {string} [params.model='small'] - Modelo
 * @param {AbortSignal} [params.signal] - Sinal de cancelamento
 * @param {Function} [params.onProgress] - Callback de progresso
 * @param {Function} [params.onLog] - Callback de log
 * @returns {Promise<{ text: string, segments: Array, durationMs: number }>}
 */
export async function transcribeWithTransformers({
  audioPath,
  language = 'pt',
  model = 'small',
  signal,
  onProgress,
  onLog,
}) {
  const startedAt = Date.now();

  if (!fs.existsSync(audioPath)) {
    throw new Error(`Arquivo de audio nao encontrado: ${audioPath}`);
  }

  const available = await checkTransformers();
  if (!available) {
    throw new Error(
      '@xenova/transformers nao encontrado.\n' +
      'Execute: npm install @xenova/transformers\n' +
      'Ou instale o whisper.cpp: npm run whisper:install'
    );
  }

  const modelId = resolveModelId(model);
  onLog?.(`[whisper-transformers] Modelo: ${model} (${modelId})`);

  try {
    const { transcriber } = await loadTranscriber({ modelId, onProgress, onLog });

    onLog?.('[whisper-transformers] Iniciando transcricao...');

    const result = await transcriber(audioPath, {
      language,
      task: 'transcribe',
      return_timestamps: true,
      signal,
    });

    const durationMs = Date.now() - startedAt;
    onLog?.(`[whisper-transformers] Transcricao concluida em ${formatElapsed(durationMs)}`);

    const text = result.text || '';
    const segments = extractSegments(result);

    return { text, segments, durationMs };
  } catch (err) {
    resetTranscriberCache();
    throw err;
  }
}
