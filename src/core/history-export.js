/**
 * History export — CSV / JSON.
 *
 * SPEC-08: docs/specs/08-exportar-historico.md
 *
 * Módulo puro (sem dependência de Electron): serializa entradas do histórico
 * para formatos abertos, permitindo reuso no CLI e no Electron.
 */

import fs from 'node:fs';

/** Colunas do CSV, na ordem de saída. */
export const CSV_HEADERS = Object.freeze([
  'id',
  'title',
  'url',
  'provider',
  'format',
  'destination',
  'status',
  'size',
  'durationMs',
  'date',
]);

/** Serializa as entradas como JSON formatado. */
export function exportHistoryAsJson(entries) {
  const list = Array.isArray(entries) ? entries : [];
  return JSON.stringify(list, null, 2);
}

/** Serializa as entradas como CSV (UTF-8 com BOM, compatível com Excel). */
export function exportHistoryAsCsv(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const header = CSV_HEADERS.join(',');
  const rows = list.map((entry) =>
    CSV_HEADERS.map((key) => escapeCsvValue(entry?.[key])).join(',')
  );
  const bom = '\uFEFF';
  return [bom + header, ...rows].join('\n');
}

/** Escapa um valor de célula CSV (RFC 4180). */
export function escapeCsvValue(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serializa as entradas no formato pedido.
 * @param {Array} entries
 * @param {'csv'|'json'} format
 */
export function serializeHistory(entries, format = 'json') {
  return format === 'csv' ? exportHistoryAsCsv(entries) : exportHistoryAsJson(entries);
}

/**
 * Escreve as entradas em `filePath`.
 * @returns {{ ok: boolean, filePath?: string, size?: number, error?: string }}
 */
export function exportHistoryToFile({ entries, format = 'json', filePath } = {}) {
  if (!filePath || typeof filePath !== 'string') {
    return { ok: false, error: 'Caminho de destino não informado.' };
  }
  try {
    const content = serializeHistory(entries, format);
    fs.writeFileSync(filePath, content, 'utf-8');
    return { ok: true, filePath, size: Buffer.byteLength(content, 'utf-8'), count: Array.isArray(entries) ? entries.length : 0 };
  } catch (err) {
    return { ok: false, error: err?.message || 'Falha ao escrever o arquivo.' };
  }
}

/** Nome de arquivo sugerido para o diálogo "Salvar como". */
export function suggestExportFilename(format = 'json', now = new Date()) {
  const stamp = now.toISOString().slice(0, 10);
  const ext = format === 'csv' ? 'csv' : 'json';
  return `streamgrab-historico-${stamp}.${ext}`;
}