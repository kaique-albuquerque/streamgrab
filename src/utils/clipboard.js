/**
 * Leitura da área de transferência no Windows.
 */

import { spawnSync } from 'node:child_process';

/**
 * Lê o conteúdo da área de transferência do Windows via PowerShell.
 * (spawn, sem exec — sem risco de injeção de comando)
 */
export function getClipboardText() {
  try {
    const res = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'Get-Clipboard -Raw'],
      { encoding: 'utf8', windowsHide: true, timeout: 5000 }
    );
    if (res.status === 0 && res.stdout) {
      return String(res.stdout).trim();
    }
  } catch {
    /* clipboard indisponível (sem Windows/PowerShell) */
  }
  return '';
}
