/**
 * Parsers de saída do whisper.cpp: progresso e arquivos gerados.
 */

/**
 * Parseia um arquivo SRT em array de segmentos.
 *
 * @param {string} srtContent - Conteudo do arquivo SRT
 * @returns {Array<{ index: number, start: string, end: string, startMs: number, endMs: number, text: string }>}
 */
export function parseSrt(srtContent) {
  const segments = [];
  const blocks = srtContent.split(/\n\s*\n/).filter(Boolean);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;

    const index = parseInt(lines[0], 10);
    if (isNaN(index)) continue;

    const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
    if (!timeMatch) continue;

    const text = lines.slice(2).join(' ').trim();
    if (!text) continue;

    segments.push({
      index,
      start: timeMatch[1].replace(',', '.'),
      end: timeMatch[2].replace(',', '.'),
      startMs: parseTimeToMs(timeMatch[1]),
      endMs: parseTimeToMs(timeMatch[2]),
      text,
    });
  }

  return segments;
}

/** Progresso no formato `progress: HH:MM:SS / HH:MM:SS`. */
export function handleTimeProgress(chunk, lastProgress, onProgress) {
  const progressMatch = chunk.match(/progress:\s*(\d{2}:\d{2}:\d{2})\s*\/\s*(\d{2}:\d{2}:\d{2})/);
  if (!progressMatch) return lastProgress;

  const elapsed = parseTimeToSeconds(progressMatch[1]);
  const total = parseTimeToSeconds(progressMatch[2]);
  const percent = total > 0 ? Math.round((elapsed / total) * 100) : 0;

  if (percent <= lastProgress) return lastProgress;

  onProgress?.({
    elapsed,
    total,
    percent,
    elapsedStr: progressMatch[1],
    totalStr: progressMatch[2],
  });
  return percent;
}

/** Progresso no formato `NN%` (ou `progress = NN%`). */
export function handleWhisperOutput(chunk, lastProgress, onProgress) {
  let nextProgress = lastProgress;
  const percentMatches = chunk.matchAll(/(?:progress\s*=\s*)?(\d{1,3})\s*%/gi);

  for (const match of percentMatches) {
    const percent = Math.max(0, Math.min(100, Number.parseInt(match[1], 10)));
    if (percent > nextProgress || (percent === 100 && nextProgress < 100)) {
      nextProgress = percent;
      onProgress?.({ percent });
    }
  }

  return nextProgress;
}

export function parseTimeToSeconds(timeStr) {
  const parts = timeStr.split(':');
  if (parts.length === 3) {
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
  }
  if (parts.length === 2) {
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }
  return parseInt(parts[0], 10) || 0;
}

export function parseTimeToMs(timeStr) {
  const clean = timeStr.replace(',', '.');
  const [time, ms] = clean.split('.');
  const seconds = parseTimeToSeconds(time);
  return seconds * 1000 + (parseInt(ms, 10) || 0);
}
