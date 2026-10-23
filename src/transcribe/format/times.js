/** Formatacao de timestamps (mm:ss para Markdown, hh:mm:ss,mmm para SRT). */

export function formatTimestamp(ms) {
  if (!ms || ms < 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatSrtTime(ms) {
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
