/** Detecção de disponibilidade do binário FFmpeg. */

import { spawnSync } from 'node:child_process';
import { sleep } from '../../core/retry.js';
import { getFfmpegCommand } from './paths.js';

/**
 * Verifica se o FFmpeg está disponível (empacotado > vendor/ffmpeg > PATH).
 * Retorna true/false (nunca lança exceção).
 *
 * P10: com retry — na 1ª execução de um binário recém-instalado o Windows
 * (Defender/SmartScreen) pode segurar ou bloquear o spawn (EPERM/access
 * denied) por alguns segundos; tentativa única gerava falsos "FFmpeg nao
 * encontrado" no app empacotado. O motivo real da última falha é logado
 * (antes o catch engolia tudo).
 */
export async function checkFfmpeg({ retries = 3, retryDelayMs = 1500 } = {}) {
  let lastReason = '';
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const cmd = getFfmpegCommand();
      const r = spawnSync(cmd, ['-version'], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
      const out = `${r.stdout || ''}\n${r.stderr || ''}`;
      if (r.status === 0 && /ffmpeg version/i.test(out)) return true;
      lastReason = `status=${r.status}${r.error ? ` error=${r.error.message}` : ''}`;
    } catch (err) {
      lastReason = err?.message || String(err);
    }
    if (attempt < retries) await sleep(retryDelayMs);
  }
  console.error(`[ffmpeg] checkFfmpeg falhou apos ${retries} tentativas: ${lastReason}`);
  return false;
}
