export function truncate(text, max) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max - 3)}...`;
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function appendProgress(container, data) {
  if (!container) return;
  const row = document.createElement('div');
  row.className = `batch-progress-item ${data.status === 'enqueued' ? 'success' : data.status === 'error' ? 'error' : 'pending'}`;

  const icon = data.status === 'enqueued' ? '✅' : data.status === 'error' ? '❌' : '⏳';
  const label = data.status === 'analyzing'
    ? 'analisando...'
    : data.status === 'enqueued'
      ? `Fila #${data.jobId || '?'}`
      : data.error || 'erro';

  row.innerHTML = `
    <span class="batch-progress-icon">${icon}</span>
    <span class="batch-progress-url">${escapeHtml(truncate(data.url, 60))}</span>
    <span class="batch-progress-status">${escapeHtml(label)}</span>
  `;
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}
