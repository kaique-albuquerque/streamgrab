/** Formatadores e estimativas de MediaInfo. */

/** Formata duração (segundos) em "H:MM:SS" ou "MM:SS". */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** Estima o tamanho (bytes) a partir de bitrate bps + duração em segundos. */
export function estimateSizeBytes(bitrate, durationSeconds) {
  const bps = Number(bitrate) || 0;
  const secs = Number(durationSeconds) || 0;
  if (bps <= 0 || secs <= 0) return 0;
  return Math.round((bps / 8) * secs);
}

/** Detecta o container a partir da extensão no path da URL. */
export function detectContainerFromUrl(value) {
  try {
    const pathname = new URL(String(value || '')).pathname || '';
    const match = pathname.match(/\.([A-Za-z0-9]{1,12})$/);
    return match ? match[1].toLowerCase() : '';
  } catch {
    return '';
  }
}
