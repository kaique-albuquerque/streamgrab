/**
 * Traducao do stdout do yt-dlp em updates de progresso.
 *
 * O yt-dlp imprime o progresso do download no stdout:
 *
 *   [info] abc: Downloading 1 format(s): 137+140
 *   [download] Destination: C:\out\video.f137.mp4
 *   [download]  53.3% of   30.00MiB at 997.60MiB/s ETA 00:00
 *   [download] 100% of   30.00MiB in 00:00:06 at 5.00MiB/s
 *   [Merger] Merging formats into "C:\out\video.mp4"
 *
 * Com `--newline` cada update vem em uma linha propria; mesmo assim o parser
 * aceita `\r` puro, e guarda a linha parcial entre chunks (o pipe corta em
 * qualquer byte).
 *
 * A agregacao dos streams (percentual voltando a zero no segundo) e a
 * traducao de cada linha ficam em ./ytdlp-progress-parse.js.
 */

import { aggregatePercent, classifyLine } from './ytdlp-progress-parse.js';

/**
 * @param {(update: object) => void} onProgress recebe o update a cada linha.
 * @returns {{ push: (chunk: any) => void, finish: () => void }}
 */
export function createYtDlpProgressReporter(onProgress) {
  if (typeof onProgress !== 'function') {
    throw new TypeError('createYtDlpProgressReporter: onProgress e obrigatorio');
  }

  let pending = '';
  let formatsTotal = 0;
  let streamIndex = 0;
  let lastPercent = 0;
  let lastTotalBytes;
  let merged = false;

  function emit(update) {
    const clean = { stage: 'downloading' };
    for (const [key, value] of Object.entries(update)) {
      if (value !== undefined) clean[key] = value;
    }
    onProgress(clean);
  }

  function handleLine(line) {
    const parsed = classifyLine(line);
    if (!parsed) return;

    if (parsed.kind === 'formats') {
      if (parsed.count > 0) formatsTotal = parsed.count;
      return;
    }

    if (parsed.kind === 'merge') {
      if (merged) return;
      merged = true;
      onProgress({
        stage: 'merging',
        percent: 100,
        bytesDownloaded: lastTotalBytes,
        totalBytes: lastTotalBytes,
        message: 'Juntando video e audio...',
      });
      return;
    }

    if (parsed.kind === 'destination') {
      streamIndex += 1;
      if (formatsTotal > 1) {
        emit({ percent: lastPercent, message: `Baixando parte ${streamIndex} de ${formatsTotal}...` });
      }
      return;
    }

    if (streamIndex === 0) streamIndex = 1;
    if (parsed.totalBytes !== undefined) lastTotalBytes = parsed.totalBytes;

    const percent = aggregatePercent({
      streamIndex,
      streamPercent: parsed.percent,
      streams: Math.max(formatsTotal, streamIndex, 1),
    });
    lastPercent = percent;

    emit({
      percent,
      bytesDownloaded: parsed.totalBytes === undefined
        ? undefined
        : Math.round((parsed.percent / 100) * parsed.totalBytes),
      totalBytes: parsed.totalBytes,
      speed: parsed.speed,
      etaSeconds: parsed.etaSeconds,
    });
  }

  return {
    push(chunk) {
      if (chunk === undefined || chunk === null) return;
      pending += String(chunk);
      const parts = pending.split(/\r\n|\n|\r/);
      pending = parts.pop() ?? '';
      for (const line of parts) {
        if (line) handleLine(line);
      }
    },
    finish() {
      if (pending) {
        const rest = pending;
        pending = '';
        handleLine(rest);
      }
      onProgress({
        stage: 'downloading',
        percent: 100,
        bytesDownloaded: lastTotalBytes,
        totalBytes: lastTotalBytes,
        message: 'Download concluido via yt-dlp.',
      });
    },
  };
}

export default { createYtDlpProgressReporter };
