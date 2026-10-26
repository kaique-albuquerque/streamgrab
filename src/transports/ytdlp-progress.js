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
 * O download adaptativo (bestvideo+bestaudio) baixa DOIS streams com o
 * percentual voltando a zero no segundo. Aqui os streams sao agregados em um
 * unico percentual (a contagem vem do "+" em `Downloading 1 format(s): 137+140`),
 * senao a barra encheria, voltaria para 0% e encheria de novo.
 */

const SIZE_FACTORS = {
  b: 1,
  kib: 1024,
  mib: 1024 ** 2,
  gib: 1024 ** 3,
  tib: 1024 ** 4,
  kb: 1000,
  mb: 1000 ** 2,
  gb: 1000 ** 3,
  tb: 1000 ** 4,
};

const PROGRESS_RE = /^\[download\]\s+([\d.]+)%/;
const SIZE_RE = /\bof\s+(?:~\s*)?([\d.]+)\s*([KMGTP]?i?B)\b/i;
const SPEED_RE = /\bat\s+([\d.]+)\s*([KMGTP]?i?B)\/s/i;
const ETA_RE = /\bETA\s+(\d+:\d+(?::\d+)?)/i;
const FORMATS_RE = /Downloading\s+\d+\s+format\(s\):\s*(.+)$/;
const DESTINATION_RE = /^\[download\]\s+Destination:/;
const MERGER_RE = /^\[Merger\]/;

function toBytes(match) {
  if (!match) return undefined;
  const value = Number(match[1]);
  const factor = SIZE_FACTORS[String(match[2] || 'b').toLowerCase()];
  if (!Number.isFinite(value) || !factor) return undefined;
  return Math.round(value * factor);
}

function toSeconds(text) {
  if (!text) return undefined;
  const parts = text.split(':').map(Number);
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n))) return undefined;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

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
    const formats = FORMATS_RE.exec(line);
    if (formats) {
      const count = formats[1].trim().split(/\s*\+\s*/).filter(Boolean).length;
      if (count > 0) formatsTotal = count;
      return;
    }

    if (MERGER_RE.test(line)) {
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

    if (DESTINATION_RE.test(line)) {
      streamIndex += 1;
      if (formatsTotal > 1) {
        emit({ percent: lastPercent, message: `Baixando parte ${streamIndex} de ${formatsTotal}...` });
      }
      return;
    }

    const progress = PROGRESS_RE.exec(line);
    if (!progress) return;
    const streamPercent = Number(progress[1]);
    if (!Number.isFinite(streamPercent)) return;
    if (streamIndex === 0) streamIndex = 1;

    const totalBytes = toBytes(SIZE_RE.exec(line));
    if (totalBytes !== undefined) lastTotalBytes = totalBytes;
    const speed = toBytes(SPEED_RE.exec(line));
    const etaSeconds = toSeconds(ETA_RE.exec(line)?.[1]);

    const streams = Math.max(formatsTotal, streamIndex, 1);
    const percent = Math.min(
      100,
      Math.round((((streamIndex - 1) + Math.min(100, streamPercent) / 100) / streams) * 1000) / 10,
    );
    lastPercent = percent;

    emit({
      percent,
      bytesDownloaded: totalBytes === undefined ? undefined : Math.round((streamPercent / 100) * totalBytes),
      totalBytes,
      speed,
      etaSeconds,
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
