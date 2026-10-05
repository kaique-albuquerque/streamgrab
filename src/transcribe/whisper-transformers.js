/**
 * Fallback: transcricao via @xenova/transformers (Node.js puro).
 *
 * Usa o pacote @xenova/transformers para transcrever audio sem
 * necessidade de binario externo (whisper.cpp). Mais lento que
 * o whisper.cpp, mas funciona em qualquer ambiente com Node.js.
 */
import fs from 'node:fs';

// Modelo unico: small
const MODEL_MAP = {
  small: 'Xenova/whisper-small',
};

let cachedTranscriber = null;
let cachedModelId = null;

/**
 * Verifica se @xenova/transformers esta disponivel.
 *
 * @returns {Promise<boolean>}
 */
export async function checkTransformers() {
  try {
    await import('@xenova/transformers');
    return true;
  } catch {
    return false;
  }
}

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

  const modelId = MODEL_MAP[model];
  if (!modelId) {
    throw new Error(`Modelo desconhecido: ${model}. Opcoes: ${Object.keys(MODEL_MAP).join(', ')}`);
  }

  onLog?.(`[whisper-transformers] Modelo: ${model} (${modelId})`);

  try {
    const { pipeline, env } = await import('@xenova/transformers');

    env.allowLocalModels = true;
    env.useBrowserCache = false;

    if (cachedTranscriber && cachedModelId === modelId) {
      onLog?.(`[whisper-transformers] Reutilizando modelo em cache`);
    } else {
      onLog?.(`[whisper-transformers] Carregando modelo (pode demorar na primeira vez)...`);
      cachedTranscriber = await pipeline('automatic-speech-recognition', modelId, {
        progress_callback: (progress) => {
          if (progress.status === 'downloading') {
            const percent = progress.progress || 0;
            onProgress?.({
              stage: 'downloading',
              percent: Math.round(percent),
              file: progress.file,
            });
          } else if (progress.status === 'loading') {
            onProgress?.({
              stage: 'loading',
              percent: 100,
            });
          }
        },
      });
      cachedModelId = modelId;
    }

    onLog?.(`[whisper-transformers] Iniciando transcricao...`);

    const result = await cachedTranscriber(audioPath, {
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
    cachedTranscriber = null;
    cachedModelId = null;
    throw err;
  }
}

/**
 * Extrai segmentos do resultado do transformers.
 *
 * @param {object} result - Resultado do pipeline
 * @returns {Array<{ index: number, startMs: number, endMs: number, text: string }>}
 */
function extractSegments(result) {
  const segments = [];

  if (result.chunks && Array.isArray(result.chunks)) {
    for (let i = 0; i < result.chunks.length; i++) {
      const chunk = result.chunks[i];
      segments.push({
        index: i + 1,
        startMs: Math.round((chunk.timestamp?.[0] || 0) * 1000),
        endMs: Math.round((chunk.timestamp?.[1] || 0) * 1000),
        text: chunk.text || '',
      });
    }
  }

  return segments;
}

function formatElapsed(ms) {
  if (ms >= 3_600_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} min`;
  if (ms >= 1_000) return `${Math.round(ms / 1_000)}s`;
  return `${ms}ms`;
}

export default transcribeWithTransformers;
