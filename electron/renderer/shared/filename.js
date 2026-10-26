/** Nome/estensão do arquivo de saída a partir do estado da aba. */

export function sanitizeFilename(value) {
  const cleaned = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[.\s]+$/g, '')
    .replace(/^[.\s]+/g, '');
  return cleaned || 'video';
}

export function detectExtensionFromUrl(value) {
  try {
    const pathname = new URL(String(value || '')).pathname || '';
    const match = pathname.match(/\.([A-Za-z0-9]{1,12})$/);
    return match ? `.${match[1].toLowerCase()}` : '';
  } catch {
    return '';
  }
}

export function resolvePreferredExtension(state) {
  // YouTube/sociais sempre geram MP4 apos mux — ignorar o container nativo
  // (ex: webm para VP9) que o yt-dlp reporta.
  const st = String(state.media?.sourceType || '').toLowerCase();
  if (st === 'youtube' || st === 'social' || st === 'ytdlp') return '.mp4';
  const container = String(state.media?.container || '').trim().toLowerCase();
  if (container && /^[a-z0-9]{1,12}$/.test(container)) return `.${container}`;
  return detectExtensionFromUrl(state.selectedQuality || state.sourceUrl || state.fields.url.value.trim()) || '.mp4';
}

export function ensureExpectedExtension(name, ext) {
  return name.toLowerCase().endsWith(ext.toLowerCase()) ? name : `${name}${ext}`;
}

export function resolveDesiredFilename(state) {
  const typed = state.fields.filename.value.trim();
  const fallbackBase = state.media?.title || (state.media?.sourceType === 'direct' ? 'arquivo' : 'video');
  const baseName = sanitizeFilename(typed || fallbackBase);
  return ensureExpectedExtension(baseName, resolvePreferredExtension(state));
}
