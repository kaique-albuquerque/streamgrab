/**
 * Extração de preview via yt-dlp (YouTube, redes sociais e fallback).
 */

import { spawn } from 'node:child_process';
import { PREVIEW_YTDLP_TIMEOUT_MS, YTDLP_FORMAT_PREFIX } from './constants.js';
import { isYtDlpFormatSelector } from './eligibility.js';

/**
 * Monta os argumentos do yt-dlp para baixar um trecho curto de preview.
 * Puro — testável sem executar nada.
 *
 * @param {string} url       URL original do vídeo (YouTube, etc.)
 * @param {string} quality   Seletor de formato (ytdlp-format:ID) ou URL vazio
 * @param {string} outputPath Caminho do arquivo de saída (.mp4)
 * @returns {string[]}       Argumentos para spawn
 */
export function buildYtDlpPreviewArgs({ url, quality, outputPath }) {
  const args = [
    '--no-warnings',
    '--no-playlist',
    '--downloader', 'ffmpeg',
    '--downloader-args', 'ffmpeg:-t 60',
    '--force-keyframes-at-cuts',
    '--remux-video', 'mp4',
    '-o', outputPath,
  ];

  // Se o quality é um seletor ytdlp-format, extrai o format ID.
  if (isYtDlpFormatSelector(quality)) {
    const formatId = quality.slice(YTDLP_FORMAT_PREFIX.length);
    // Formato específico: pode ser adaptativo (só vídeo). Nesse caso,
    // mescla automaticamente com o melhor áudio disponível.
    args.push('-f', `${formatId}+bestaudio/best`);
  } else {
    // Melhor combinação: vídeo progressivo OU melhor vídeo + melhor áudio.
    args.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best');
  }

  args.push(url);
  return args;
}

/** Extrai a mensagem mais útil do stderr do yt-dlp. */
export function extractYtDlpError(stderr) {
  const text = String(stderr || '');
  if (/HTTP Error 403/i.test(text)) return 'Acesso recusado (403). O vídeo pode ser restrito ou privado.';
  if (/HTTP Error 404/i.test(text)) return 'Vídeo não encontrado (404).';
  if (/Private video/i.test(text)) return 'Este vídeo é privado e não pode ser acessado.';
  if (/Sign in to confirm/i.test(text)) return 'O YouTube está pedindo confirmação de login. Tente outro vídeo.';
  if (/This video is unavailable/i.test(text)) return 'Este vídeo está indisponível.';
  if (/is not a valid URL/i.test(text)) return 'A URL fornecida não é válida.';
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .pop();
  return line ? line.slice(0, 240) : '';
}

/** Executa o yt-dlp para baixar um trecho curto de preview. */
export function runYtDlpPreview({ url, quality, outputPath, ytdlpPath }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stderr = '';

    const args = buildYtDlpPreviewArgs({ url, quality, outputPath });
    const proc = spawn(ytdlpPath, args, { windowsHide: true });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { proc.kill('SIGKILL'); } catch { /* ignore */ }
      reject(new Error('O preview via yt-dlp demorou demais. Tente baixar diretamente.'));
    }, PREVIEW_YTDLP_TIMEOUT_MS);

    proc.stderr?.on('data', (chunk) => {
      if (stderr.length < 3000) stderr += String(chunk);
    });

    proc.stdout?.on('data', (chunk) => {
      if (stderr.length < 3000) stderr += String(chunk);
    });

    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`yt-dlp indisponível: ${err?.message || err}`));
    });

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(extractYtDlpError(stderr) || `yt-dlp terminou com código ${code}.`));
    });
  });
}
