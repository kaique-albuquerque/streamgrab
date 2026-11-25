/**
 * Caminhos do llama.cpp (binário vendorizado e marcador).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { binName } from '../../core/binaries.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

export const BIN_NAME = binName('llama-server');
export const VENDOR_DIR = path.join(PROJECT_ROOT, 'vendor', 'llama');
export const VENDOR_BIN = path.join(VENDOR_DIR, BIN_NAME);
export const VENDOR_MARKER = path.join(VENDOR_DIR, '.installed');