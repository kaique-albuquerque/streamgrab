/**
 * Parsing das linhas de progresso do FFmpeg.
 */

export function parseFfmpegProgressSeconds(key, value) {
  if (key === 'out_time_ms' || key === 'out_time_us') {
    return Number(value) / 1_000_000;
  }

  if (key === 'out_time') {
    return parseTimeToSeconds(value);
  }

  return NaN;
}

export function parseTimeToSeconds(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return NaN;

  const [time, fraction = '0'] = timeStr.split('.');
  const parts = time.split(':').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return NaN;
  }

  const [hours, minutes, seconds] = parts;
  return (hours * 3600) + (minutes * 60) + seconds + (Number(`0.${fraction}`) || 0);
}
