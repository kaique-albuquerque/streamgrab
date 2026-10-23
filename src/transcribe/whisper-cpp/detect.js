/**
 * Detecção do binário do whisper.cpp.
 *
 * Ordem de preferência: WHISPER_CPP_PATH → binário empacotado → instalação
 * vendorizada → PATH do sistema.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { binName, packagedBinaryPath } from '../../core/binaries.js';
import { BIN_NAME, VENDOR_BIN, VENDOR_MARKER, VENDOR_MODELS } from './paths.js';

/**
 * Verifica se o whisper.cpp esta disponivel.
 *
 * @returns {{ available: boolean, binPath: string, modelsDir: string }}
 */
export function checkWhisperCpp() {
  const envBin = process.env.WHISPER_CPP_PATH;
  if (envBin && fs.existsSync(envBin)) {
    const envModels = process.env.WHISPER_MODEL_DIR || path.join(path.dirname(envBin), 'models');
    return { available: true, binPath: envBin, modelsDir: envModels };
  }

  const packagedBin = packagedBinaryPath(BIN_NAME);
  if (packagedBin && fs.existsSync(packagedBin)) {
    const packagedModels = path.join(path.dirname(packagedBin), '..', 'whisper', 'models');
    const modelsDir = process.env.WHISPER_MODEL_DIR || path.normalize(packagedModels);
    return { available: true, binPath: packagedBin, modelsDir };
  }

  if (isVendorWhisperInstalled()) {
    const vendorModels = process.env.WHISPER_MODEL_DIR || VENDOR_MODELS;
    return { available: true, binPath: VENDOR_BIN, modelsDir: vendorModels };
  }

  for (const command of ['whisper-cli', 'whisper', 'main']) {
    const binPath = findCommand(command);
    if (binPath) {
      return { available: true, binPath, modelsDir: path.join(path.dirname(binPath), 'models') };
    }
  }

  return { available: false, binPath: '', modelsDir: '' };
}

/**
 * Instalação vendorizada (vendor/whisper) está pronta para uso?
 *
 * Depende apenas do BINÁRIO: o modelo é escolhido (e baixado) depois, pelo
 * usuário. Acoplar a disponibilidade do motor à presença de um modelo
 * específico fazia o app reportar "engine indisponível" mesmo com o
 * whisper.cpp instalado — e a transcrição ficava presa sem explicação.
 */
function isVendorWhisperInstalled() {
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
    if (!marker || typeof marker !== 'object') return null;
    return marker;
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
