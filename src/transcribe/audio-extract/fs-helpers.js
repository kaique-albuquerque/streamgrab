/**
 * Helpers de arquivo para extração de áudio.
 */

import fs from 'node:fs';
import path from 'node:path';

export function cleanupFileSync(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignorar erros de limpeza
  }
}

export function formatSize(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

/**
 * Remove o WAV extraído e, se o diretório temporário foi criado aqui e
 * ficou vazio, remove o diretório também.
 */
export function makeCleanup({ audioPath, tmpDir, outputDir, onLog }) {
  return async () => {
    try {
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
        onLog?.(`[audio-extract] Arquivo temporario removido: ${path.basename(audioPath)}`);
      }
      if (tmpDir !== outputDir && fs.existsSync(tmpDir)) {
        const remaining = fs.readdirSync(tmpDir);
        if (remaining.length === 0) {
          fs.rmdirSync(tmpDir);
        }
      }
    } catch (err) {
      onLog?.(`[audio-extract] AVISO: falha ao limpar temporario: ${err.message}`);
    }
  };
}
