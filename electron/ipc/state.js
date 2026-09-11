/**
 * Estado compartilhado entre os handlers IPC do Electron.
 *
 * Cada módulo de handler importa `getServices`, `getAlllowedRevealRoots`, etc.
 * para acessar o estado sem acoplamento circular.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerRevealRoot } from '../security.js';

export const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

/** Serviços do Core (queue, settings, history) — criados no ready(). */
let services = null;

export function getServices() {
  return services;
}

export function setServices(s) {
  services = s;
}

/** Compatibilidade: taskId (abas) -> jobId (fila real). */
export const taskToJob = new Map();

/** Raízes permitidas para abrir/localizar arquivos (seção 24: path traversal). */
const allowedRevealRoots = new Set();

export function getAlllowedRevealRoots() {
  return allowedRevealRoots;
}

export function addRevealRoot(dir) {
  registerRevealRoot(dir, allowedRevealRoots);
}
