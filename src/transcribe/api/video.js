/**
 * Transcrição completa de um vídeo: extrai áudio, transcreve e escreve saída.
 */

import { extractAudio } from '../audio-extract.js';
import { writeTranscription, titleFromVideoPath } from '../format.js';
import { DEFAULT_MODEL } from '../model-manager.js';
import { transcribeAudio } from './audio.js';

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
 * @param {string} [params.model='small'] - Id do modelo no catalogo
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
  model = DEFAULT_MODEL,
  signal,
  onProgress,
  onLog,
}) {
  const startedAt = Date.now();

  onLog?.(`[transcribe] Iniciando transcricao de: ${videoPath}`);
  onLog?.(`[transcribe] Idioma: ${language}, Modelo: ${model}`);

  onLog?.(`[transcribe] Etapa 1/3: Extraindo audio...`);
  const { audioPath, cleanup } = await extractAudio({
    videoPath,
    signal,
    onLog,
    onProgress: (progress) => {
      onProgress?.({ stage: 'extracting', ...progress });
    },
  });

  try {
    onLog?.(`[transcribe] Etapa 2/3: Transcrevendo audio...`);
    // Marca o inicio do estagio de transcricao: durante o carregamento do
    // modelo do whisper (pode demorar segundos) nao chega progresso — sem
    // este evento a UI ficaria travada em "Extraindo audio 100%".
    onProgress?.({ stage: 'transcribing', percent: 0 });
    const result = await transcribeAudio({
      audioPath,
      language,
      model,
      signal,
      onProgress: (progress) => {
        onProgress?.({ stage: 'transcribing', ...progress });
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
