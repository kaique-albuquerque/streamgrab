/**
 * Resolução de caminho do binário FFmpeg: empacotado (extraResources/bin) >
 * local (vendor/ffmpeg) > PATH.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { binName, getPackagedResourcesPath } from '../../core/binaries.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const VENDOR_DIR = path.join(PROJECT_ROOT, 'vendor', 'ffmpeg');
const BIN_NAME = binName('ffmpeg');
const BIN_PATH = path.join(VENDOR_DIR, BIN_NAME);
const INSTALLED_MARKER = path.join(VENDOR_DIR, '.installed');

function isLocalFfmpegReady() {
  return fs.existsSync(BIN_PATH) && fs.existsSync(INSTALLED_MARKER);
}

/** Caminho do FFmpeg empacotado (extraResources/bin) ou ''. */
function packagedFfmpegPath() {
  const root = getPackagedResourcesPath();
  return root ? path.join(root, 'bin', BIN_NAME) : '';
}

/**
 * Caminho do FFmpeg: empacotado (produção, extraResources/bin) > local
 * (instalado por scripts/install-ffmpeg.mjs em vendor/ffmpeg/) > PATH.
 */
export function getFfmpegCommand() {
  const packaged = packagedFfmpegPath();
  if (packaged && fs.existsSync(packaged)) return packaged;
  if (isLocalFfmpegReady()) return BIN_PATH;
  return 'ffmpeg';
}
