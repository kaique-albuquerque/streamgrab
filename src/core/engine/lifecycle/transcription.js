/**
 * Transcrição pós-download (SPEC-09).
 */

import fs from 'node:fs';

/**
 * Extrai áudio do vídeo, transcreve via Whisper e gera arquivos .txt/.md
 * ao lado do vídeo para uso com NotebookLM.
 */
export async function processTranscription(engine, job, {
  transcribe, transcribeLang, transcribeTimestamps,
}) {
  if (!transcribe || !job.meta?.output) return;
  if (!fs.existsSync(job.meta?.output)) return;

  const { transcribeVideo } = await import('../../../transcribe/index.js');

  const language = transcribeLang || 'pt';
  const formats = transcribeTimestamps !== false ? ['txt', 'md'] : ['txt'];

  engine._emit('log', {
    jobId: job.id,
    message: `[transcribe] iniciando transcrição (idioma: ${language})`,
  });

  try {
    const result = await transcribeVideo({
      videoPath: job.meta.output,
      language,
      formats,
      signal: engine._active.get(job.id)?.attempt?.signal,
      onProgress: ({ stage, percent, elapsedStr, totalStr }) => {
        if (stage === 'transcribing' && percent !== undefined) {
          engine._emit('progress', {
            jobId: job.id,
            stage: 'transcribing',
            percent,
            message: `Transcrevendo: ${percent}%${elapsedStr ? ` (${elapsedStr}/${totalStr})` : ''}`,
          });
        }
      },
      onLog: (message) => engine._emit('log', { jobId: job.id, message }),
    });

    engine._emit('log', {
      jobId: job.id,
      message: `[transcribe] ✅ ${result.files.length} arquivo(s) gerado(s) via ${result.engine}`,
    });
  } catch (err) {
    engine._emit('log', {
      jobId: job.id,
      message: `[transcribe] ⚠️ Falha na transcrição: ${err.message}`,
    });
    // Não falhar o download por causa da transcrição
  }
}
