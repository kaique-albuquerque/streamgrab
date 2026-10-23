/**
 * Marcador de integridade (<modelo>.sha256) gravado ao final de um download.
 *
 * Um marcador registra o hash já conferido, evitando reler gigabytes a cada
 * abertura do app.
 */

import fs from 'node:fs';

export const MARKER_EXT = '.sha256';

/** Caminho do marcador correspondente a um arquivo de modelo. */
export function markerPath(modelPath) {
  return `${modelPath}${MARKER_EXT}`;
}

/** Lê o marcador gravado ao final de um download verificado (null se ausente). */
export function readMarker(modelPath) {
  try {
    const raw = JSON.parse(fs.readFileSync(markerPath(modelPath), 'utf8'));
    return raw && typeof raw === 'object' ? raw : null;
  } catch {
    return null;
  }
}

/** Grava o marcador de integridade de um modelo já verificado. */
export function writeMarker(modelPath, sha256) {
  try {
    const size = fs.statSync(modelPath).size;
    fs.writeFileSync(markerPath(modelPath), JSON.stringify({ sha256, size }), 'utf8');
  } catch {
    /* o marcador é opcional: falhar ao gravar não invalida o modelo */
  }
}
