/**
 * Utilitários de sistema de arquivos e formatação para a transcrição.
 */

import fs from 'node:fs';

/** Remove o diretório temporário de saída (melhor esforço). */
export function cleanupDir(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch {
    // Ignorar erros de limpeza
  }
}

/** Duração legível para o log (ex.: 1.5h, 3 min, 12s, 800ms). */
export function formatElapsed(ms) {
  if (ms >= 3_600_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} min`;
  if (ms >= 1_000) return `${Math.round(ms / 1_000)}s`;
  return `${ms}ms`;
}
