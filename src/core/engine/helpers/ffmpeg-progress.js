export function makeFfmpegProgress(onProgress, durationMs) {
  let outMs = 0;
  let totalSize = 0;
  let startedAtMs = 0;
  let lastSize = 0;
  let lastSpeedMs = 0;
  let estimatedTotal = 0;
  return ({ key, value }) => {
    if (!startedAtMs) startedAtMs = Date.now();
    if (key === 'out_time_us') outMs = Number(value) / 1000;
    else if (key === 'out_time_ms') outMs = Number(value);
    else if (key === 'total_size') totalSize = Number(value);

    const elapsedSec = (Date.now() - startedAtMs) / 1000;
    const speed = elapsedSec > 0 ? totalSize / elapsedSec : 0;

    let percent = 0;
    let etaSeconds = null;

    if (durationMs > 0) {
      // Caso ideal: duracao conhecida (YouTube, sociais, etc.)
      percent = Math.min(100, Math.round((outMs / durationMs) * 1000) / 10);
      etaSeconds = outMs > 0 ? Math.max(0, (durationMs - outMs) / 1000) : null;
    } else if (totalSize > 0 && elapsedSec > 3) {
      // Sem duracao (HLS via FFmpeg): estimar progresso pela velocidade.
      const windowMs = Date.now() - lastSpeedMs;
      if (windowMs > 2500 && lastSize > 0) {
        const windowSpeed = (totalSize - lastSize) / (windowMs / 1000);
        const blended = speed * 0.3 + windowSpeed * 0.7;
        if (blended > 0) {
          const estimatedRemaining = blended * Math.max(5, elapsedSec * 0.5);
          estimatedTotal = Math.max(estimatedTotal, totalSize + estimatedRemaining);
        }
        lastSize = totalSize;
        lastSpeedMs = Date.now();
      }
      if (estimatedTotal > 0) {
        percent = Math.min(99, Math.round((totalSize / estimatedTotal) * 1000) / 10);
        const remaining = estimatedTotal - totalSize;
        etaSeconds = speed > 0 ? remaining / speed : null;
      }
    }

    onProgress({ bytesDownloaded: totalSize, totalBytes: 0, percent, speed, etaSeconds });
  };
}
