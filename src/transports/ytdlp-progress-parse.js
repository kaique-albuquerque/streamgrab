/**
 * Parsing puro das linhas de stdout do yt-dlp.
 *
 * Fica separado do reporter (que guarda estado entre linhas) para que a
 * tradução de uma linha possa ser testada isoladamente, sem montar um
 * download inteiro.
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

/** Converte `30.00MiB` (match de SIZE_RE/SPEED_RE) em bytes. */
export function toBytes(match) {
  if (!match) return undefined;
  const value = Number(match[1]);
  const factor = SIZE_FACTORS[String(match[2] || 'b').toLowerCase()];
  if (!Number.isFinite(value) || !factor) return undefined;
  return Math.round(value * factor);
}

/** Converte `00:03` / `1:02:03` em segundos. */
export function toSeconds(text) {
  if (!text) return undefined;
  const parts = text.split(':').map(Number);
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n))) return undefined;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/**
 * Classifica uma linha do yt-dlp.
 *
 * A ordem importa: `Downloading N format(s)` vem antes de qualquer
 * `[download]`, e `[Merger]`/`Destination:` não são progresso.
 *
 * @returns {{ kind: 'formats', count: number }
 *   | { kind: 'merge' } | { kind: 'destination' }
 *   | { kind: 'progress', percent: number, totalBytes: number|undefined,
 *       speed: number|undefined, etaSeconds: number|undefined }
 *   | null} `null` para linhas irrelevantes.
 */
export function classifyLine(line) {
  const formats = FORMATS_RE.exec(line);
  if (formats) {
    return { kind: 'formats', count: formats[1].trim().split(/\s*\+\s*/).filter(Boolean).length };
  }

  if (MERGER_RE.test(line)) return { kind: 'merge' };
  if (DESTINATION_RE.test(line)) return { kind: 'destination' };

  const progress = PROGRESS_RE.exec(line);
  if (!progress) return null;

  const percent = Number(progress[1]);
  if (!Number.isFinite(percent)) return null;

  return {
    kind: 'progress',
    percent,
    totalBytes: toBytes(SIZE_RE.exec(line)),
    speed: toBytes(SPEED_RE.exec(line)),
    etaSeconds: toSeconds(ETA_RE.exec(line)?.[1]),
  };
}

/**
 * Percentual agregado do download.
 *
 * O download adaptativo baixa varios streams em sequencia, cada um comecando
 * em 0%. Aqui eles viram um unico valor monotono: o stream atual mais a
 * fracao concluida dele, dividido pelo total de streams.
 */
export function aggregatePercent({ streamIndex, streamPercent, streams }) {
  const total = Math.max(streams, 1);
  const current = Math.max(streamIndex, 1);
  const fraction = Math.min(100, streamPercent) / 100;
  return Math.min(100, Math.round((((current - 1) + fraction) / total) * 1000) / 10);
}