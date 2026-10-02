/**
 * Formatacao de saida da transcricao.
 *
 * Converte o resultado do Whisper em arquivos de saida formatados:
 * - .txt: Texto puro (ideal para NotebookLM)
 * - .md: Texto com timestamps (para referencia)
 * - .srt: Legendas SRT
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Gera texto puro formatado.
 *
 * @param {object} params
 * @param {string} params.text - Texto bruto da transcricao
 * @param {string} [params.title] - Titulo do documento
 * @returns {string} Texto formatado
 */
export function formatTxt({ text, title }) {
  const lines = [];
  if (title) {
    lines.push(title);
    lines.push('');
  }

  const cleanText = cleanTranscriptionText(text);
  lines.push(cleanText);
  return lines.join('\n').trim() + '\n';
}

/**
 * Gera Markdown com timestamps.
 *
 * @param {object} params
 * @param {Array} params.segments - Segmentos da transcricao
 * @param {string} [params.title] - Titulo do documento
 * @returns {string} Markdown formatado
 */
export function formatMd({ segments, title }) {
  const lines = [];
  if (title) {
    lines.push(`# ${title}`);
    lines.push('');
  }

  if (!segments || segments.length === 0) {
    lines.push('*Nenhum segmento com timestamps disponivel.*');
    return lines.join('\n') + '\n';
  }

  let lastParagraph = [];
  let lastMinute = -1;

  for (const segment of segments) {
    const timestamp = formatTimestamp(segment.startMs);
    const minute = Math.floor((segment.startMs || 0) / 60000);
    const text = cleanSegmentText(segment.text);

    if (!text) continue;

    if (minute !== lastMinute && lastParagraph.length > 0) {
      lines.push(`**[${lastParagraph[0].timestamp}]** ${lastParagraph.map((s) => s.text).join(' ')}`);
      lines.push('');
      lastParagraph = [];
    }

    lastParagraph.push({ timestamp, text });
    lastMinute = minute;
  }

  if (lastParagraph.length > 0) {
    lines.push(`**[${lastParagraph[0].timestamp}]** ${lastParagraph.map((s) => s.text).join(' ')}`);
  }

  return lines.join('\n').trim() + '\n';
}

/**
 * Salva arquivos de transcricao ao lado do video.
 *
 * @param {object} params
 * @param {string} params.videoPath - Caminho do video original
 * @param {string} params.text - Texto da transcricao
 * @param {Array} params.segments - Segmentos com timestamps
 * @param {string} [params.title] - Titulo do documento
 * @param {string[]} [params.formats=['txt', 'md']] - Formatos de saida
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
      continue;
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
 * @param {Array} params.segments - Segmentos da transcricao
 * @returns {string} Conteudo SRT
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

function cleanTranscriptionText(text) {
  if (!text) return '';
  return text
    .replace(/\[(?:Musica|Music|Musica de fundo|Background music)\]/gi, '')
    .replace(/\[(?:Risadas|Laughter|Laughing)\]/gi, '')
    .replace(/\[(?:Aplausos|Applause)\]/gi, '')
    .replace(/\[(?:Silencio|Silence)\]/gi, '')
    .replace(/\[(?:Apito|Whistle)\]/gi, '')
    .replace(/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function cleanSegmentText(text) {
  if (!text) return '';
  return text
    .replace(/\[(?:Musica|Music)\]/gi, '')
    .replace(/\[(?:Risadas|Laughter)\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function formatTimestamp(ms) {
  if (!ms || ms < 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

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
 * Obtem um titulo legivel a partir do nome do arquivo de video.
 *
 * @param {string} videoPath - Caminho do video
 * @returns {string} Titulo formatado
 */
export function titleFromVideoPath(videoPath) {
  const base = path.basename(videoPath, path.extname(videoPath));
  return base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export default writeTranscription;
