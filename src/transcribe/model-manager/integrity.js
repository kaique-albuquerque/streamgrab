/**
 * Verificação de integridade dos arquivos baixados (tamanho e SHA-256).
 */

import fs from 'node:fs';
import { createHash } from 'node:crypto';

/** Formata bytes para mensagens de erro legíveis. */
export function formatSize(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

/** Alimenta `hash` com os primeiros `length` bytes do arquivo. */
export async function hashExisting(filePath, hash, length) {
  const stream = fs.createReadStream(filePath, { end: length - 1 });
  for await (const chunk of stream) hash.update(chunk);
}

/** SHA-256 do arquivo completo. */
export async function sha256OfFile(filePath) {
  const hash = createHash('sha256');
  await hashExisting(filePath, hash, Number.MAX_SAFE_INTEGER);
  return hash.digest('hex');
}

/**
 * Confere tamanho e, quando disponível, o SHA-256 do arquivo.
 *
 * Um arquivo corrompido é descartado (retomar não ajudaria); um arquivo
 * apenas incompleto é mantido para retomada.
 *
 * @param {string} filePath - Arquivo a validar
 * @param {object} info - Entrada do catálogo
 * @param {string} model - Id do modelo (mensagens de erro)
 * @param {import('node:crypto').Hash | null} [hash] - Hash já calculado do arquivo
 */
export async function verifyIntegrity(filePath, info, model, hash = null) {
  const size = fs.statSync(filePath).size;
  if (size < info.minSize) {
    throw new Error(
      `Modelo ${model} baixado parece incompleto (${formatSize(size)} de ~${formatSize(info.expectedSize)}). ` +
        'Execute o download novamente.'
    );
  }

  if (!info.sha256) return;

  const digest = hash ? hash.digest('hex') : await sha256OfFile(filePath);
  if (digest === info.sha256) return;

  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    /* melhor esforço: o erro abaixo já explica o problema */
  }

  throw new Error(
    `Modelo ${model} corrompido: o hash SHA-256 não confere. ` +
      'O arquivo inválido foi descartado — baixe novamente.'
  );
}
