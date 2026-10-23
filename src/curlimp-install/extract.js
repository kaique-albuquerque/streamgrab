import { spawnSync } from 'node:child_process';

export function extractZip(zipPath, outDir) {
  const cmd = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force`;
  const r = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', cmd],
    { encoding: 'utf8', windowsHide: true, timeout: 180000 }
  );
  if (r.status !== 0) throw new Error(`Falha ao extrair ZIP: ${r.stderr || r.stdout || 'erro desconhecido'}`);
}

export function extractTar(archivePath, outDir) {
  const r = spawnSync(
    'tar.exe',
    ['-xf', archivePath, '-C', outDir],
    { encoding: 'utf8', windowsHide: true, timeout: 180000 }
  );
  if (r.status !== 0) {
    throw new Error(`Falha ao extrair TAR: ${r.stderr || r.stdout || 'erro desconhecido'}`);
  }
}
