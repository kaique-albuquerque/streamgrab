/**
 * Diretório padrão de downloads.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Pasta padrão de saída no Windows: Downloads do usuário atual,
 * obtida programaticamente (sem nome de usuário hardcoded).
 */
export function getDefaultDownloadsDir() {
  const envDir = process.env.STREAMGRAB_DOWNLOAD_DIR;
  if (envDir && envDir.trim()) return envDir.trim();

  const home = os.homedir();
  const candidates = [path.join(home, 'Downloads'), home, process.cwd()];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
    } catch {
      /* tenta a próxima */
    }
  }
  return home;
}
