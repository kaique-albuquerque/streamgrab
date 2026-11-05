/**
 * Lote — lista de nomes editáveis (um por URL).
 *
 * O usuário pode renomear cada arquivo antes de enfileirar. O nome é apenas
 * a base: o engine acrescenta a extensão final (`.mp4`, `.ts`, `.m4a`...).
 */

/** Extensões que o usuário costuma digitar e que não fazem parte do nome. */
const MEDIA_EXT_RE = /\.(mp4|mkv|webm|mov|m4v|ts|m4a|mp3|aac|flac|opus|wav|ogg|avi|flv|wmv|mpg|mpeg|3gp|m3u8|mpd)$/i;

/** Sugestão inicial: último segmento da URL, ou `video-<n>`. */
export function suggestName(url, index) {
  try {
    const pathname = new URL(url).pathname || '';
    const last = decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '');
    return last.replace(MEDIA_EXT_RE, '') || `video-${index + 1}`;
  } catch {
    return `video-${index + 1}`;
  }
}

/** Rótulo da lista de nomes (deixa claro que cada linha é editável). */
const NAMES_HEADER = '✏️ Nomes dos arquivos — edite cada um antes de enfileirar';

/** Lê os nomes digitados, na ordem da lista. */
export function collectNames(container) {
  if (!container) return [];
  return [...container.querySelectorAll('[data-batch-name]')].map((input) => input.value.trim());
}

/**
 * (Re)desenha a lista de nomes. `previous` guarda o que o usuário já digitou
 * por URL, para não perder o texto quando a lista é recriada.
 */
export function renderNameFields(container, urls, previous = new Map()) {
  if (!container) return;
  container.innerHTML = '';
  if (!urls.length) {
    container.hidden = true;
    return;
  }
  container.hidden = false;

  const header = document.createElement('div');
  header.className = 'batch-names-header';
  header.textContent = `${NAMES_HEADER} (${urls.length})`;
  container.appendChild(header);

  urls.forEach((url, index) => {
    const row = document.createElement('label');
    row.className = 'batch-name-row';

    const badge = document.createElement('span');
    badge.className = 'batch-name-index';
    badge.textContent = String(index + 1);

    const input = document.createElement('input');
    input.type = 'text';
    input.dataset.batchName = 'true';
    input.value = previous.get(url) ?? suggestName(url, index);
    input.placeholder = 'nome do arquivo (sem extensão)';
    input.title = url;
    input.addEventListener('input', () => previous.set(url, input.value));

    row.append(badge, input);
    container.appendChild(row);
  });
}
