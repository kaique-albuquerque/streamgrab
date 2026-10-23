/**
 * Caminhos do whisper.cpp (binário vendorizado, marcador e modelos).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { binName } from '../../core/binaries.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// whisper.cpp v1.9.4+ usa whisper-cli em vez de main
export const BIN_NAME = binName('whisper-cli');
export const VENDOR_DIR = path.join(PROJECT_ROOT, 'vendor', 'whisper');
export const VENDOR_BIN = path.join(VENDOR_DIR, BIN_NAME);
export const VENDOR_MODELS = path.join(VENDOR_DIR, 'models');
export const VENDOR_MARKER = path.join(VENDOR_DIR, '.installed');
