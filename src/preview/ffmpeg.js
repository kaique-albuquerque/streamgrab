/**
 * Extração de preview via FFmpeg (mídia direta, HLS, DASH).
 */

import { spawn } from 'node:child_process';
import { DEFAULT_USER_AGENT } from '../utils.js';
import { PREVIEW_DURATION_SECONDS, PREVIEW_TIMEOUT_MS } from './constants.js';

/**
 * Monta os argumentos do FFmpeg para extrair o trecho de preview.
 * Puro — testável sem executar nada.
 */
export function buildPreviewArgs({ inputUrl, outputPath, durationSeconds = PREVIEW_DURATION_SECONDS }) {
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostats',
    '-y',
    '-i', inputUrl,
    '-t', String(durationSeconds),
    '-c', 'copy',
    '-movflags', '+faststart',
    '-f', 'mp4',
    outputPath,
  ];
}

/** Extrai a mensagem mais útil do stderr do FFmpeg. */
export function extractFfmpegError(stderr) {
  const text = String(stderr || '');
  if (/403|Forbidden/i.test(text)) return 'A URL expirou ou foi recusada (403). Copie uma URL nova no DevTools.';
  if (/404|Not Found/i.test(text)) return 'O trecho não foi encontrado no servidor (404).';
  if (/Invalid data found|moov atom not found/i.test(text)) return 'O formato da mídia não pôde ser lido para preview.';
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .pop();
  return line ? line.slice(0, 240) : '';
}

/** Executa o FFmpeg para extrair o trecho (args estruturados, sem shell). */
export function runFfmpegPreview({ inputUrl, outputPath, ffmpegPath, headers }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stderr = '';

    const args = buildPreviewArgs({ inputUrl, outputPath });
    // Garante User-Agent padrão se nenhum foi fornecido (evita 403 em servidores).
    let headerStr = String(headers || '');
    if (!headerStr.includes('User-Agent:')) {
      headerStr += `User-Agent: ${DEFAULT_USER_AGENT}\r\n`;
    }
    if (headerStr.trim()) args.splice(args.indexOf('-i'), 0, '-headers', headerStr);

    const proc = spawn(ffmpegPath, args, { windowsHide: true });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { proc.kill('SIGKILL'); } catch { /* ignore */ }
      reject(new Error('O preview demorou muito para ser gerado. Tente baixar diretamente.'));
    }, PREVIEW_TIMEOUT_MS);

    proc.stderr?.on('data', (chunk) => {
      if (stderr.length < 2000) stderr += String(chunk);
    });

    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`FFmpeg indisponível: ${err?.message || err}`));
    });

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(extractFfmpegError(stderr) || `FFmpeg terminou com código ${code}.`));
    });
  });
}
