/**
 * Batch — nomes de arquivo e timeout de análise.
 *
 * O batch gera apenas o NOME BASE: a extensão final é decidida pelo engine
 * (`.ts` para URL direta `.ts`, `.mp4` para HLS/DASH). Forçar `.mp4` aqui
 * gerava nomes como `video.mp4.ts` e, após a extração de áudio,
 * `video.mp4.m4a`.
 */

/** Extensões de mídia que não devem virar parte do nome. */
const MEDIA_EXT_RE = /\.(mp4|mkv|webm|mov|m4v|ts|m4a|mp3|aac|flac|opus|wav|ogg|avi|flv|wmv|mpg|mpeg|3gp|m3u8|mpd)$/i;

function defaultSanitize(value) {
  return String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[.\s]+$/g, '')
    .replace(/^[.\s]+/g, '');
}

/**
 * Gera o nome base a partir do nome escolhido pelo usuário, do título ou do
 * path da URL. `index` garante um fallback distinto por item (`video-1`).
 */
export function buildFilename({ title, url, sanitizeFilename, index = 0 }) {
  const sanitize = typeof sanitizeFilename === 'function' ? sanitizeFilename : defaultSanitize;
  const fallback = `video-${index + 1}`;
  let base = String(title || '').trim();

  if (!base) {
    try {
      const pathname = new URL(url).pathname || '';
      base = decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '') || fallback;
    } catch {
      base = fallback;
    }
  }

  const withoutExt = base.replace(MEDIA_EXT_RE, '');
  return sanitize(withoutExt) || fallback;
}

/** `Promise.race` com timeout, cancelando o timer quando a promessa resolve. */
export function withTimeout(promise, ms) {
  let timer = null;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout na análise (${Math.round(ms / 1000)}s)`)), ms);
    }),
  ]);
}
