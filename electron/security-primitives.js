/**
 * P8 — Primitivas de validação de segurança.
 *
 * Funções puras de validação/sanitização de valores atômicos:
 * URLs, taskIds, filenames, paths, headers, browser specs.
 * Sem dependência do Electron.
 */

const URL_PROTOCOL_RE = /^https?:\/\//i;
const INTERNAL_MEDIA_SELECTION_RE = /^(ytdlp-format:[A-Za-z0-9._-]+)$/;
const TASK_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const BROWSER_SPEC_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const FILENAME_BAD_RE = /[\\/]|\.\./;
const ABSOLUTE_WIN_RE = /^[A-Za-z]:[\\/]/;
const ABSOLUTE_POSIX_RE = /^\//;
const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9a-zA-Z]+$/;
const UNSAFE_PROPS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Sanitiza objeto de headers vindo do IPC:
 *  - Rejeita propriedades de poluição de protótipo (__proto__, etc.)
 *  - Valida nomes de header contra caracteres RFC válidos
 *  - Remove caracteres de controle (CRLF, NUL) prevenindo HTTP Header Injection
 *  - Trunca valores a limites razoáveis (4096 chars)
 */
export function sanitizeHeaders(rawHeaders) {
  if (!rawHeaders || typeof rawHeaders !== 'object' || Array.isArray(rawHeaders)) return {};
  const clean = {};
  for (const [key, val] of Object.entries(rawHeaders)) {
    if (UNSAFE_PROPS.has(key)) continue;
    const name = String(key).trim();
    if (!name || !HEADER_NAME_RE.test(name)) continue;
    if (val === null || val === undefined) continue;
    const valueStr = String(val).replace(/[\r\n\0]/g, '').trim().slice(0, 4096);
    if (!valueStr) continue;
    clean[name] = valueStr;
  }
  return clean;
}

/** Valida uma URL não confiável vinda do renderer (apenas http/https). */
export function isSafeHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const url = String(value).trim();
  if (!URL_PROTOCOL_RE.test(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Valida seletores internos de formato (ex.: ytdlp-format:137) ou URL segura. */
export function isSafeMediaSelection(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const raw = String(value).trim();
  return isSafeHttpUrl(raw) || INTERNAL_MEDIA_SELECTION_RE.test(raw);
}

/** Valida o identificador de tarefa (formato restrito). */
export function isValidTaskId(value) {
  return typeof value === 'string' && TASK_ID_RE.test(value);
}

/** Valida a especificação do navegador para cookies-from-browser (ex.: chrome, firefox:default). */
export function isValidBrowserSpec(value) {
  return typeof value === 'string' && BROWSER_SPEC_RE.test(value);
}

/** Normaliza/valida um nome de arquivo: sem separadores nem traversal. */
export function sanitizeDownloadFilename(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (FILENAME_BAD_RE.test(raw)) return '';
  const cleaned = raw
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[.\s]+$/g, '')
    .replace(/^[.\s]+/g, '');
  if (!cleaned) return '';
  if (FILENAME_BAD_RE.test(cleaned)) return '';
  return cleaned;
}

/** Verifica se um caminho é absoluto (Windows ou POSIX). */
export function isAbsolutePath(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  return ABSOLUTE_WIN_RE.test(value) || ABSOLUTE_POSIX_RE.test(value);
}

/** Verifica se um caminho absoluto não contém segmentos ".." de traversal. */
export function isSafeAbsolutePath(value) {
  if (!isAbsolutePath(value)) return false;
  const segments = String(value).split(/[\\/]+/);
  return !segments.includes('..');
}

/** Verifica se `child` está dentro de `root` (ambos absolutos). */
export function isPathWithin(child, root) {
  if (typeof child !== 'string' || typeof root !== 'string') return false;
  const cPath = child.trim();
  const rPath = root.trim();
  if (!cPath || !rPath) return false;
  if (!isSafeAbsolutePath(cPath) || !isSafeAbsolutePath(rPath)) return false;

  const norm = (p) => p.replace(/[\\/]+/g, '/').replace(/\/+$/, '');
  const c = norm(cPath).toLowerCase();
  const r = norm(rPath).toLowerCase();

  if (c === r) return true;
  const rWithSlash = r.endsWith('/') ? r : `${r}/`;
  return c.startsWith(rWithSlash);
}
