/**
 * Modulo de transcricao de video/audio via Whisper.
 *
 * API publica para transcricao de videos baixados pelo StreamGrab.
 * Suporta dois engines:
 * - whisper.cpp (recomendado, mais rapido)
 * - @xenova/transformers (fallback, Node.js puro)
 *
 * Uso:
 *   import { transcribeVideo } from './transcribe/index.js';
 *
 *   const result = await transcribeVideo({
 *     videoPath: '/path/to/video.mp4',
 *     language: 'pt',
 *   });
 *
 *   console.log(result.files); // [{ path, format, size }]
 */
import { extractAudio } from './audio-extract.js';
import { checkWhisperCpp, transcribeWithCpp } from './whisper-cpp.js';
import { checkTransformers, transcribeWithTransformers } from './whisper-transformers.js';
import { writeTranscription, titleFromVideoPath } from './format.js';

// Modelo unico: small (~244 MB)
const DEFAULT_MODEL = 'small';

/**
 * Verifica se a transcricao e possivel no ambiente atual.
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
      'Nenhum engine de transcricao encontrado.\n' +
      'Opcao 1: Execute npm run whisper:install\n' +
      'Opcao 2: Execute npm install @xenova/transformers',
  };
}

/**
 * Transcreve um arquivo de audio.
 *
 * @param {object} params
 * @param {string} params.audioPath - Caminho do arquivo de audio (WAV 16kHz mono)
 * @param {string} [params.language='pt'] - Codigo do idioma
 * @param {AbortSignal} [params.signal] - Sinal de cancelamento
 * @param {Function} [params.onProgress] - Callback de progresso
 * @param {Function} [params.onLog] - Callback de log
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

  const transformers = await checkTransformers();
  if (transformers) {
    onLog?.(`[transcribe] Usando @xenova/transformers (fallback)`);
    const result = await transcribeWithTransformers({
      audioPath,
      language,
      model: DEFAULT_MODEL,
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

/**
 * Transcreve um arquivo de video.
 *
 * Extrai o audio, transcreve e gera arquivos de saida ao lado do video.
 *
 * @param {object} params
 * @param {string} params.videoPath - Caminho do video
 * @param {string} [params.language='pt'] - Codigo do idioma
 * @param {string[]} [params.formats=['txt', 'md']] - Formatos de saida
 * @param {string} [params.title] - Titulo do documento opcional
 * @param {AbortSignal} [params.signal] - Sinal de cancelamento
 * @param {Function} [params.onProgress] - Callback de progresso
 * @param {Function} [params.onLog] - Callback de log
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

  onLog?.(`[transcribe] Iniciando transcricao de: ${videoPath}`);
  onLog?.(`[transcribe] Idioma: ${language}, Modelo: ${DEFAULT_MODEL}`);

  onLog?.(`[transcribe] Etapa 1/3: Extraindo audio...`);
  const { audioPath, cleanup } = await extractAudio({
    videoPath,
    signal,
    onLog,
    onProgress: (progress) => {
      onProgress?.({
        stage: 'extracting',
        ...progress,
      });
    },
  });

  try {
    onLog?.(`[transcribe] Etapa 2/3: Transcrevendo audio...`);
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

    onLog?.(`[transcribe] Etapa 3/3: Gerando arquivos de saida...`);
    const docTitle = title || titleFromVideoPath(videoPath);
    const { files } = await writeTranscription({
      videoPath,
      text: result.text,
      segments: result.segments,
      title: docTitle,
      formats,
    });

    const durationMs = Date.now() - startedAt;
    onLog?.(`[transcribe] OK: Transcricao concluida!`);
    onLog?.(`[transcribe] Arquivos gerados: ${files.length}`);
    for (const file of files) {
      onLog?.(`[transcribe]   ${file.path} (${formatSize(file.size)})`);
    }

    return {
      files,
      engine: result.engine,
      durationMs,
      text: result.text,
      segments: result.segments,
    };
  } finally {
    await cleanup();
  }
}

function formatSize(bytes) {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

export { checkWhisperCpp } from './whisper-cpp.js';
export { checkTransformers } from './whisper-transformers.js';
export { extractAudio, hasAudio, getAudioDuration } from './audio-extract.js';
export { formatTxt, formatMd, formatSrt, writeTranscription, titleFromVideoPath } from './format.js';

export default transcribeVideo;
