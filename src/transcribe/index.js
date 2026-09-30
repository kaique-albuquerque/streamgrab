/**
 * Módulo de transcrição de vídeo/áudio via Whisper.
 *
 * API pública para transcrição de vídeos baixados pelo StreamGrab.
 * Suporta dois engines:
 * - whisper.cpp (recomendado, mais rápido)
 * - @xenova/transformers (fallback, Node.js puro)
 *
 * Dois níveis de qualidade:
 * - fast: Modelo small (~15 min para 1h de vídeo)
 * - max: Modelo medium (~25 min para 1h de vídeo)
 *
 * Uso:
 *   import { transcribeVideo } from './transcribe/index.js';
 *
 *   const result = await transcribeVideo({
 *     videoPath: '/path/to/video.mp4',
 *     language: 'pt',
 *     quality: 'fast',
 *   });
 *
 *   console.log(result.files); // [{ path, format, size }]
 */
import { extractAudio } from './audio-extract.js';
import { checkWhisperCpp, transcribeWithCpp } from './whisper-cpp.js';
import { checkTransformers, transcribeWithTransformers } from './whisper-transformers.js';
import { writeTranscription, titleFromVideoPath } from './format.js';

// Modelo único: small (~244 MB) — bom equilíbrio qualidade/velocidade
const DEFAULT_MODEL = 'small';

/**
 * Verifica se a transcrição é possível no ambiente atual.
 *
 * @returns {Promise<{ available: boolean, engine: string, reason?: string }>}
 */
export async function checkTranscriptionAvailable() {
  const cpp = checkWhisperCpp();
  if (cpp.available) {
    return { available: true, engine: 'whisper-cpp' };
  }

  const transformers = await checkTransformers();
  if (transformers) {
    return { available: true, engine: 'whisper-transformers' };
  }

  return {
    available: false,
    engine: '',
    reason:
      'Nenhum engine de transcrição encontrado.\n' +
      'Opção 1: Execute npm run whisper:install\n' +
      'Opção 2: Execute npm install @xenova/transformers',
  };
}

/**
 * Transcreve um arquivo de áudio.
 *
 * @param {object} params
 * @param {string} params.audioPath — Caminho do arquivo de áudio (WAV 16kHz mono)
 * @param {string} [params.language='pt'] — Código do idioma
 * @param {AbortSignal} [params.signal] — Sinal de cancelamento
 * @param {Function} [params.onProgress] — Callback de progresso
 * @param {Function} [params.onLog] — Callback de log
 * @returns {Promise<{ text: string, segments: Array, engine: string, durationMs: number }>}
 */
export async function transcribeAudio({
  audioPath,
  language = 'pt',
  signal,
  onProgress,
  onLog,
}) {
  onLog?.(`[transcribe] Engine: auto-detect, modelo: ${DEFAULT_MODEL}`);

  // Tentar whisper.cpp primeiro
  const cpp = checkWhisperCpp();
  if (cpp.available) {
    onLog?.(`[transcribe] Usando whisper.cpp`);
    const result = await transcribeWithCpp({
      audioPath,
      language,
      model: DEFAULT_MODEL,
      signal,
      onProgress,
      onLog,
    });
    return { ...result, engine: 'whisper-cpp' };
  }

  // Fallback para @xenova/transformers
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
    'Nenhum engine de transcrição encontrado.\n' +
    'Execute: npm run whisper:install\n' +
    'Ou: npm install @xenova/transformers'
  );
}

/**
 * Transcreve um arquivo de vídeo.
 *
 * Extrai o áudio, transcreve e gera arquivos de saída ao lado do vídeo.
 *
 * @param {object} params
 * @param {string} params.videoPath — Caminho do vídeo
 * @param {string} [params.language='pt'] — Código do idioma
 * @param {string[]} [params.formats=['txt', 'md']] — Formatos de saída
 * @param {string} [params.title] — Título do documento (opcional)
 * @param {AbortSignal} [params.signal] — Sinal de cancelamento
 * @param {Function} [params.onProgress] — Callback de progresso
 * @param {Function} [params.onLog] — Callback de log
 * @returns {Promise<{ files: Array, engine: string, durationMs: number }>}
 */
export async function transcribeVideo({
  videoPath,
  language = 'pt',
  formats = ['txt', 'md'],
  title,
  signal,
  onProgress,
  onLog,
}) {
  const startedAt = Date.now();

  onLog?.(`[transcribe] Iniciando transcrição de: ${videoPath}`);
  onLog?.(`[transcribe] Idioma: ${language}, Modelo: ${DEFAULT_MODEL}`);

  // Extrair áudio
  onLog?.(`[transcribe] Etapa 1/3: Extraindo áudio...`);
  const { audioPath, cleanup } = await extractAudio({
    videoPath,
    signal,
    onLog,
  });

  try {
    // Transcrever
    onLog?.(`[transcribe] Etapa 2/3: Transcrevendo áudio...`);
    const result = await transcribeAudio({
      audioPath,
      language,
      signal,
      onProgress: (progress) => {
        onProgress?.({
          stage: 'transcribing',
          ...progress,
        });
      },
      onLog,
    });

    // Gerar arquivos de saída
    onLog?.(`[transcribe] Etapa 3/3: Gerando arquivos de saída...`);
    const docTitle = title || titleFromVideoPath(videoPath);
    const { files } = await writeTranscription({
      videoPath,
      text: result.text,
      segments: result.segments,
      title: docTitle,
      formats,
    });

    const durationMs = Date.now() - startedAt;
    onLog?.(`[transcribe] ✅ Transcrição concluída!`);
    onLog?.(`[transcribe] Arquivos gerados: ${files.length}`);
    for (const file of files) {
      onLog?.(`[transcribe]   📄 ${file.path} (${formatSize(file.size)})`);
    }

    return {
      files,
      engine: result.engine,
      durationMs,
      text: result.text,
      segments: result.segments,
    };
  } finally {
    // Limpar áudio temporário
    await cleanup();
  }
}

// ---------------------------------------------------------------------------
// Funções auxiliares
// ---------------------------------------------------------------------------

function formatSize(bytes) {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

// Re-exports para conveniência
export { checkWhisperCpp } from './whisper-cpp.js';
export { checkTransformers } from './whisper-transformers.js';
export { extractAudio, hasAudio, getAudioDuration } from './audio-extract.js';
export { formatTxt, formatMd, formatSrt, writeTranscription, titleFromVideoPath } from './format.js';

export default transcribeVideo;
