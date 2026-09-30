/**
 * Formatação de saída da transcrição.
 *
 * Converte o resultado do Whisper em arquivos de saída formatados:
 * - .txt: Texto puro (ideal para NotebookLM)
 * - .md: Texto com timestamps (para referência)
 * - .srt: Legendas SRT (padrão Whisper)
 *
 * Uso:
 *   const files = await writeTranscription({
 *     videoPath: '/path/to/video.mp4',
 *     text: 'Texto transcrito...',
 *     segments: [...],
 *     formats: ['txt', 'md'],
 *   });
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Gera texto puro formatado (para NotebookLM).
 *
 * @param {object} params
 * @param {string} params.text — Texto branco da transcrição
 * @param {string} [params.title] — Título do documento
 * @returns {string} Texto formatado
 */
export function formatTxt({ text, title }) {
  const lines = [];
  if (title) {
    lines.push(title);
    lines.push('');
  }
  // Limpar e formatar texto
  const cleanText = cleanTranscriptionText(text);
  lines.push(cleanText);
  return lines.join('\n').trim() + '\n';
}

/**
 * Gera Markdown com timestamps (para referência).
 *
 * @param {object} params
 * @param {Array} params.segments — Segmentos da transcrição
 * @param {string} [params.title] — Título do documento
 * @returns {string} Markdown formatado
 */
export function formatMd({ segments, title }) {
  const lines = [];
  if (title) {
    lines.push(`# ${title}`);
    lines.push('');
  }

  if (!segments || segments.length === 0) {
    lines.push('*Nenhum segmento com timestamps disponível.*');
    return lines.join('\n') + '\n';
  }

  let lastParagraph = [];
  let lastMinute = -1;

  for (const segment of segments) {
    const timestamp = formatTimestamp(segment.startMs);
    const minute = Math.floor((segment.startMs || 0) / 60000);
    const text = cleanSegmentText(segment.text);

    if (!text) continue;

    // Nova linha a cada minuto ou quebra de parágrafo
    if (minute !== lastMinute && lastParagraph.length > 0) {
      lines.push(`**[${lastParagraph[0].timestamp}]** ${lastParagraph.map((s) => s.text).join(' ')}`);
      lines.push('');
      lastParagraph = [];
    }

    lastParagraph.push({ timestamp, text });
    lastMinute = minute;
  }

  // Último parágrafo
  if (lastParagraph.length > 0) {
    lines.push(`**[${lastParagraph[0].timestamp}]** ${lastParagraph.map((s) => s.text).join(' ')}`);
  }

  return lines.join('\n').trim() + '\n';
}

/**
 * Salva arquivos de transcrição ao lado do vídeo.
 *
 * @param {object} params
 * @param {string} params.videoPath — Caminho do vídeo original
 * @param {string} params.text — Texto da transcrição
 * @param {Array} params.segments — Segmentos com timestamps
 * @param {string} [params.title] — Título do documento
 * @param {string[]} [params.formats=['txt', 'md']] — Formatos de saída
 * @returns {Promise<{ files: Array<{ path: string, format: string, size: number }> }>}
 */
export async function writeTranscription({
  videoPath,
  text,
  segments,
  title,
  formats = ['txt', 'md'],
}) {
  const videoDir = path.dirname(videoPath);
  const videoBase = path.basename(videoPath, path.extname(videoPath));
  const files = [];

  for (const format of formats) {
    const ext = `.${format}`;
    const filePath = path.join(videoDir, `${videoBase}.transcription${ext}`);

    let content = '';
    if (format === 'txt') {
      content = formatTxt({ text, title });
    } else if (format === 'md') {
      content = formatMd({ segments, title });
    } else if (format === 'srt') {
      content = formatSrt({ segments });
    } else {
      continue; // Formato não suportado
    }

    fs.writeFileSync(filePath, content, 'utf8');
    const stat = fs.statSync(filePath);

    files.push({
      path: filePath,
      format,
      size: stat.size,
    });
  }

  return { files };
}

/**
 * Gera SRT a partir dos segmentos.
 *
 * @param {object} params
 * @param {Array} params.segments — Segmentos da transcrição
 * @returns {string} Conteúdo SRT
 */
export function formatSrt({ segments }) {
  if (!segments || segments.length === 0) return '';

  const lines = [];
  for (const segment of segments) {
    lines.push(String(segment.index));
    lines.push(`${formatSrtTime(segment.startMs)} --> ${formatSrtTime(segment.endMs)}`);
    lines.push(cleanSegmentText(segment.text));
    lines.push('');
  }
  return lines.join('\n').trim() + '\n';
}

// ---------------------------------------------------------------------------
// Funções auxiliares
// ---------------------------------------------------------------------------

/**
 * Limpa artefatos de transcrição do texto.
 *
 * @param {string} text
 * @returns {string}
 */
function cleanTranscriptionText(text) {
  if (!text) return '';
  return text
    // Remover marcações de áudio
    .replace(/\[(?:Música|Music|Música de fundo|Background music)\]/gi, '')
    .replace(/\[(?:Risadas|Laughter|Laughing)\]/gi, '')
    .replace(/\[(?:Aplausos|Applause)\]/gi, '')
    .replace(/\[(?:Silêncio|Silence)\]/gi, '')
    .replace(/\[(?:Apito|Whistle)\]/gi, '')
    // Remover timestamps SRT que possam ter vazado
    .replace(/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/g, '')
    // Limpar espaços extras
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Limpa texto de um segmento.
 *
 * @param {string} text
 * @returns {string}
 */
function cleanSegmentText(text) {
  if (!text) return '';
  return text
    .replace(/\[(?:Música|Music)\]/gi, '')
    .replace(/\[(?:Risadas|Laughter)\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Formata timestamp em milissegundos para MM:SS.
 *
 * @param {number} ms — Milissegundos
 * @returns {string} Timestamp formatado
 */
function formatTimestamp(ms) {
  if (!ms || ms < 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Formata timestamp em milissegundos para SRT (HH:MM:SS,mmm).
 *
 * @param {number} ms — Milissegundos
 * @returns {string} Timestamp SRT
 */
function formatSrtTime(ms) {
  if (!ms || ms < 0) return '00:00:00,000';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  return (
    `${String(hours).padStart(2, '0')}:` +
    `${String(minutes).padStart(2, '0')}:` +
    `${String(seconds).padStart(2, '0')},` +
    `${String(millis).padStart(3, '0')}`
  );
}

/**
 * Obtém um título legível a partir do nome do arquivo de vídeo.
 *
 * @param {string} videoPath — Caminho do vídeo
 * @returns {string} Título formatado
 */
export function titleFromVideoPath(videoPath) {
  const base = path.basename(videoPath, path.extname(videoPath));
  // Substituir underscores e hífens por espaços
  return base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export default writeTranscription;
