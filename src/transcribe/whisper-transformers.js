/**
 * Fallback: transcrição via @xenova/transformers (Node.js puro).
 *
 * Usa o pacote @xenova/transformers para transcrever áudio sem
 * necessidade de binário externo (whisper.cpp). Mais lento que
 * o whisper.cpp, mas funciona em qualquer ambiente com Node.js.
 *
 * Uso:
 *   const result = await transcribeWithTransformers({ audioPath, language: 'pt' });
 *   console.log(result.text); // Texto transcrito
 *
 * Nota: O pacote @xenova/transformers precisa estar instalado.
 *       npm install @xenova/transformers
 */
import fs from 'node:fs';
import path from 'node:path';

// Modelo único: small — bom equilíbrio qualidade/velocidade
const MODEL_MAP = {
  small: 'Xenova/whisper-small',
};

// Cache do transcriber para evitar recarregar o modelo
let cachedTranscriber = null;
let cachedModelId = null;

/**
 * Verifica se @xenova/transformers está disponível.
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
 * Transcreve áudio usando @xenova/transformers.
 *
 * @param {object} params
 * @param {string} params.audioPath — Caminho do arquivo de áudio
 * @param {string} [params.language='pt'] — Código do idioma (pt, en, es, etc.)
 * @param {string} [params.model='small'] — Modelo (tiny, base, small, medium)
 * @param {AbortSignal} [params.signal] — Sinal de cancelamento
 * @param {Function} [params.onProgress] — Callback de progresso
 * @param {Function} [params.onLog] — Callback de log
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
    throw new Error(`Arquivo de áudio não encontrado: ${audioPath}`);
  }

  // Verificar se o pacote está disponível
  const available = await checkTransformers();
  if (!available) {
    throw new Error(
      '@xenova/transformers não encontrado.\n' +
      'Execute: npm install @xenova/transformers\n' +
      'Ou instale o whisper.cpp: npm run whisper:install'
    );
  }

  // Resolver modelo
  const modelId = MODEL_MAP[model];
  if (!modelId) {
    throw new Error(`Modelo desconhecido: ${model}. Opções: ${Object.keys(MODEL_MAP).join(', ')}`);
  }

  onLog?.(`[whisper-transformers] Modelo: ${model} (${modelId})`);

  try {
    // Importar dinamicamente
    const { pipeline, env } = await import('@xenova/transformers');

    // Configurar para não usar Remote Code (segurança)
    env.allowLocalModels = true;
    env.useBrowserCache = false;

    // Carregar ou reutilizar transcriber
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

    onLog?.(`[whisper-transformers] Iniciando transcrição...`);

    // Executar transcrição
    const result = await cachedTranscriber(audioPath, {
      language,
      task: 'transcribe',
      return_timestamps: true,
    });

    const durationMs = Date.now() - startedAt;
    onLog?.(`[whisper-transformers] Transcrição concluída em ${formatElapsed(durationMs)}`);

    // Processar resultado
    const text = result.text || '';
    const segments = extractSegments(result);

    return { text, segments, durationMs };
  } catch (err) {
    // Limpar cache em caso de erro
    cachedTranscriber = null;
    cachedModelId = null;
    throw err;
  }
}

/**
 * Extrai segmentos do resultado do transformers.
 *
 * @param {object} result — Resultado do pipeline
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
