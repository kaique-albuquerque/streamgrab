/**
 * Detecção do binário do llama.cpp.
 *
 * Ordem de preferência: LLAMA_CPP_PATH → binário empacotado → instalação
 * vendorizada → PATH do sistema. Mesmo formato de
 * `src/transcribe/whisper-cpp/detect.js`.
 */

import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { binName, packagedBinaryPath } from '../../core/binaries.js';
import { BIN_NAME, VENDOR_BIN, VENDOR_MARKER } from './paths.js';

/**
 * Verifica se o llama.cpp está disponível.
 *
 * @returns {{ available: boolean, binPath: string }}
 */
export function checkLlamaCpp() {
  const envBin = process.env.LLAMA_CPP_PATH;
  if (envBin && fs.existsSync(envBin)) {
    return { available: true, binPath: envBin };
  }

  const packagedBin = packagedBinaryPath(BIN_NAME);
  if (packagedBin && fs.existsSync(packagedBin)) {
    return { available: true, binPath: packagedBin };
  }

  if (isVendorLlamaInstalled()) {
    return { available: true, binPath: VENDOR_BIN };
  }

  const fromPath = findCommand('llama-server');
  if (fromPath) {
    return { available: true, binPath: fromPath };
  }

  return { available: false, binPath: '' };
}

/**
 * Instalação vendorizada (vendor/llama) está pronta para uso?
 *
 * Depende apenas do BINÁRIO e do marker: o modelo GGUF é escolhido (e baixado)
 * depois, pelo usuário.
 */
function isVendorLlamaInstalled() {
  if (!fs.existsSync(VENDOR_BIN) || !fs.existsSync(VENDOR_MARKER)) {
    return false;
  }

  const marker = readVendorMarker();
  if (!marker) {
    return false;
  }

  return marker.platform === process.platform && marker.arch === os.arch() && marker.bin === BIN_NAME;
}

function readVendorMarker() {
  try {
    const raw = fs.readFileSync(VENDOR_MARKER, 'utf8');
    const marker = JSON.parse(raw);
    return marker && typeof marker === 'object' ? marker : null;
  } catch {
    return null;
  }
}

/** Localiza um executável no PATH (`where` no Windows, `which` nos demais). */
function findCommand(command) {
  const which = process.platform === 'win32' ? 'where' : 'which';
  const executable = binName(command);

  try {
    const result = spawnSync(which, [executable], { encoding: 'utf8', windowsHide: true });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim().split(/\r?\n/)[0].trim();
    }
  } catch {
    // Ignorar
  }

  return '';
}