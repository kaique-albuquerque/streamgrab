/**
 * Carregamento e cache do pipeline @xenova/transformers.
 */

/** Modelo unico disponível. */
export const MODEL_MAP = {
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

/** Resolve o ID do modelo, lançando erro quando desconhecido. */
export function resolveModelId(model) {
  const modelId = MODEL_MAP[model];
  if (!modelId) {
    throw new Error(`Modelo desconhecido: ${model}. Opcoes: ${Object.keys(MODEL_MAP).join(', ')}`);
  }
  return modelId;
}

/** Progresso de download/carregamento do modelo. */
function modelProgressHandler(onProgress) {
  return (progress) => {
    if (progress.status === 'downloading') {
      onProgress?.({
        stage: 'downloading',
        percent: Math.round(progress.progress || 0),
        file: progress.file,
      });
    } else if (progress.status === 'loading') {
      onProgress?.({ stage: 'loading', percent: 100 });
    }
  };
}

/**
 * Carrega (ou reutiliza do cache) o pipeline de transcrição.
 *
 * @returns {Promise<{ transcriber: Function, reused: boolean }>}
 */
export async function loadTranscriber({ modelId, onProgress, onLog }) {
  const { pipeline, env } = await import('@xenova/transformers');

  env.allowLocalModels = true;
  env.useBrowserCache = false;

  if (cachedTranscriber && cachedModelId === modelId) {
    onLog?.('[whisper-transformers] Reutilizando modelo em cache');
    return { transcriber: cachedTranscriber, reused: true };
  }

  onLog?.('[whisper-transformers] Carregando modelo (pode demorar na primeira vez)...');
  cachedTranscriber = await pipeline('automatic-speech-recognition', modelId, {
    progress_callback: modelProgressHandler(onProgress),
  });
  cachedModelId = modelId;
  return { transcriber: cachedTranscriber, reused: false };
}

/** Descarta o pipeline em cache (chamado em caso de erro). */
export function resetTranscriberCache() {
  cachedTranscriber = null;
  cachedModelId = null;
}

/** Formata uma duração em ms para exibição. */
export function formatElapsed(ms) {
  if (ms >= 3_600_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} min`;
  if (ms >= 1_000) return `${Math.round(ms / 1_000)}s`;
  return `${ms}ms`;
}
