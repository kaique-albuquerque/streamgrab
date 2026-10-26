import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createYtDlpExec } from './ytdlp-exec.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
export const RESOURCES_PATH_ENV = 'STREAMGRAB_RESOURCES_PATH';

export function binName(base) {
  return process.platform === 'win32' ? `${base}.exe` : base;
}

export function getPackagedResourcesPath() {
  const raw = process.env[RESOURCES_PATH_ENV];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : '';
}

export function packagedBinaryPath(name) {
  const root = getPackagedResourcesPath();
  return root ? path.join(root, 'bin', name) : '';
}

export function hasPackagedBinary(name, { fsImpl = fs } = {}) {
  const p = packagedBinaryPath(name);
  return Boolean(p) && fsImpl.existsSync(p);
}

let cachedYtDlp = null;

/**
 * Executor do yt-dlp sem shell.
 *
 * O `create()` do youtube-dl-exec usa `shell: true` no Windows para dar conta
 * de caminhos com espacos — e isso quebra qualquer URL com `&` na query string
 * (links `watch?v=X&list=Y`). `createYtDlpExec` (./ytdlp-exec.js) faz o spawn
 * com argv em array, reaproveitando o mapper de flags do proprio pacote para
 * manter o mesmo `--kebab-case`.
 */
export async function getYtDlpExec({ fsImpl = fs } = {}) {
  if (cachedYtDlp) return cachedYtDlp;
  const packaged = packagedBinaryPath(binName('yt-dlp'));
  const mod = await import('youtube-dl-exec');
  const buildArgs = mod.args;
  const binPath = packaged && fsImpl.existsSync(packaged)
    ? packaged
    : mod.constants.YOUTUBE_DL_PATH;
  cachedYtDlp = createYtDlpExec(binPath, { buildArgs });
  return cachedYtDlp;
}

export function resetYtDlpCache() {
  cachedYtDlp = null;
}
