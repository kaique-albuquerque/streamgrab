export function progressUpdate(downloaded, total, started) {
  const elapsed = (Date.now() - started) / 1000;
  const speed = elapsed > 0 ? downloaded / elapsed : 0;
  const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 1000) / 10) : 0;
  const etaSeconds = total > 0 && speed > 0 ? (total - downloaded) / speed : null;
  return { bytesDownloaded: downloaded, totalBytes: total, percent, speed, etaSeconds };
}

export function estimateEtaFromPercent(percent, startedAtMs) {
  const pct = Number(percent) || 0;
  if (pct <= 0 || pct >= 100) return null;
  const elapsedSec = (Date.now() - startedAtMs) / 1000;
  if (elapsedSec <= 0) return null;
  const totalSec = elapsedSec / (pct / 100);
  const remaining = totalSec - elapsedSec;
  return remaining > 0 ? remaining : 0;
}

export function segmentProgressToEngine({ done, total, totalBytes, failed }, startedAtMs = Date.now()) {
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 1000) / 10) : 0;
  const elapsedSec = (Date.now() - startedAtMs) / 1000;
  const speed = elapsedSec > 0 ? totalBytes / elapsedSec : 0;
  const etaSeconds = estimateEtaFromPercent(percent, startedAtMs);
  return { bytesDownloaded: totalBytes, totalBytes: 0, percent, speed, etaSeconds, failed };
}
