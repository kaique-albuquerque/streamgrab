/**
 * Limpeza de arquivos parciais e diagnóstico de falhas do FFmpeg.
 */

import fs from 'node:fs';
import { maskUrl } from '../../utils.js';

export function cleanupPartial(output) {
  try {
    if (fs.existsSync(output)) fs.unlinkSync(output);
  } catch {
    /* ignora */
  }
}

export function analyzeFailure(result) {
  const stderr = String(result?.stderr || '').toLowerCase();
  if (stderr.includes('403') || stderr.includes('forbidden')) return '403';
  if (
    stderr.includes('could not find tag') ||
    stderr.includes('not currently supported in container') ||
    stderr.includes('audio codec') ||
    stderr.includes('invalid data') ||
    stderr.includes('moov atom not found')
  ) {
    return 'incompatibilidade de audio/container';
  }
  return `codigo de saida ${result?.code ?? 'desconhecido'}`;
}

export function printStderrTail(io, result, url) {
  const stderr = String(result?.stderr || '');
  const masked = !url ? stderr : stderr.split(url).join(maskUrl(url));
  const lines = masked.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const tail = lines.slice(-15);
  if (tail.length) {
    io.log('\nUltimas mensagens do FFmpeg:');
    for (const line of tail) io.log(`  ${line}`);
  }
}
