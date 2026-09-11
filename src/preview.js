/**
 * Preview de mídia — gera um trecho curto (até 60s) para o usuário
 * conferir o conteúdo antes de baixar o arquivo completo.
 *
 * SPEC-06: docs/specs/06-preview-de-midia.md
 *
 * Estratégia:
 *  - mídia direta com suporte a Range: baixa apenas os primeiros bytes;
 *  - HLS/DASH: FFmpeg grava os primeiros N segundos com `-c copy`;
 *  - YouTube/redes sociais: yt-dlp baixa trecho com `--download-sections`;
 *  - yt-dlp também é fallback quando a URL não é direta.
 *
 * Este módulo não depende do Electron: recebe ffmpegPath, ytdlpPath e tempDir
 * por injeção, permitindo testes em Node puro.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DEFAULT_USER_AGENT } from './utils.js';

export const PREVIEW_DURATION_SECONDS = 60;
export const PREVIEW_MAX_BYTES = 10 * 1024 * 1024; // 10 MB para mídia direta
export const PREVIEW_TIMEOUT_MS = 30000;
export const PREVIEW_YTDLP_TIMEOUT_MS = 90000; // 90s para yt-dlp (precisa baixar + merge)
export const PREVIEW_CACHE_MS = 30 * 60 * 1000; // 30 min
export const PREVIEW_DIR_NAME = 'streamgrab-preview';

/** Prefixo de seletores de formato yt-dlp (não são URLs reais). */
export const YTDLP_FORMAT_PREFIX = 'ytdlp-format:';

/** Fontes elegíveis para preview (DRM sempre excluído). */
export const PREVIEWABLE_SOURCES = Object.freeze(['hls', 'dash', 'direct', 'youtube', 'social', 'ytdlp']);

/** Fontes que precisam de yt-dlp para resolver o URL do vídeo. */
export const YTDLP_SOURCES = Object.freeze(['youtube', 'social', 'ytdlp']);

/** Verifica se um quality é um seletor yt-dlp (não é URL direta). */
export function isYtDlpFormatSelector(quality) {
  return typeof quality === 'string' && quality.startsWith(YTDLP_FORMAT_PREFIX);
}

/** Verifica se a fonte precisa de yt-dlp para preview. */
export function needsYtDlp(sourceType, quality) {
  if (YTDLP_SOURCES.includes(String(sourceType || '').toLowerCase())) return true;
  return isYtDlpFormatSelector(quality);
}

/** Diretório de previews dentro do temp do sistema/app. */
export function getPreviewDir(tempDir) {
  return path.join(tempDir, PREVIEW_DIR_NAME);
}

/** Verifica se uma fonte pode gerar preview. */
export function canPreview(sourceType) {
  return PREVIEWABLE_SOURCES.includes(String(sourceType || '').toLowerCase());
}

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

/**
 * Gera o preview da mídia.
 *
 * @param {object} opts
 * @param {string} opts.url          URL original analisada
 * @param {string} [opts.quality]    URL da variante/qualidade escolhida
 * @param {string} [opts.sourceType] Tipo da fonte (hls/dash/direct/youtube/...)
 * @param {string} opts.ffmpegPath   Caminho do binário FFmpeg
 * @param {string} [opts.ytdlpPath]  Caminho do binário yt-dlp (para YouTube)
 * @param {string} opts.tempDir      Diretório temporário base
 * @param {string} [opts.headers]    Cabeçalhos HTTP já formatados (opcional)
 * @returns {Promise<{ok: boolean, filePath?: string, size?: number, error?: string}>}
 */
export async function generatePreview({ url, quality, sourceType, ffmpegPath, ytdlpPath = '', tempDir, headers = '' }) {
  if (!url || typeof url !== 'string') {
    return { ok: false, error: 'URL não informada.' };
  }
  if (!ffmpegPath || !tempDir) {
    return { ok: false, error: 'Configuração de preview inválida.' };
  }
  if (!canPreview(sourceType)) {
    return { ok: false, error: 'Preview não disponível para este tipo de mídia.' };
  }

  const previewDir = getPreviewDir(tempDir);
  try {
    fs.mkdirSync(previewDir, { recursive: true });
  } catch (err) {
    return { ok: false, error: `Não foi possível criar a pasta de preview: ${err?.message || err}` };
  }

  const outputPath = path.join(previewDir, `preview-${Date.now()}.mp4`);
  const inputUrl = quality || url;

  // YouTube/redes sociais: yt-dlp baixa o trecho diretamente.
  // O quality pode ser "ytdlp-format:<id>" (não é URL real).
  if (needsYtDlp(sourceType, quality) && ytdlpPath) {
    try {
      await runYtDlpPreview({ url, quality, outputPath, ytdlpPath });
    } catch (err) {
      clearPreview(outputPath);
      return { ok: false, error: err?.message || 'Falha ao gerar preview via yt-dlp.' };
    }
  } else if (needsYtDlp(sourceType, quality) && !ytdlpPath) {
    // yt-dlp não disponível — tenta FFmpeg direto como fallback
    try {
      await runFfmpegPreview({ inputUrl, outputPath, ffmpegPath, headers });
    } catch {
      clearPreview(outputPath);
      return { ok: false, error: 'Preview para YouTube/redes sociais requer yt-dlp. Instale-o para habilitar esta funcionalidade.' };
    }
  } else {
    try {
      await runFfmpegPreview({ inputUrl, outputPath, ffmpegPath, headers });
    } catch (err) {
      clearPreview(outputPath);
      return { ok: false, error: err?.message || 'Falha ao gerar o preview.' };
    }
  }

  try {
    const stat = fs.statSync(outputPath);
    if (!stat.size) {
      clearPreview(outputPath);
      return { ok: false, error: 'O preview gerado ficou vazio.' };
    }
    // Valida se o arquivo é um MP4/container válido (ftyp ou styp no header).
    // Arquivos parciais (FFmpeg morto pelo timeout) ficam sem moov atom.
    if (stat.size >= 8) {
      const headerBuf = Buffer.alloc(12);
      const fd = fs.openSync(outputPath, 'r');
      try {
        fs.readSync(fd, headerBuf, 0, 12, 0);
      } finally {
        fs.closeSync(fd);
      }
      const boxType = headerBuf.subarray(4, 8).toString('ascii');
      if (!['ftyp', 'styp'].includes(boxType)) {
        clearPreview(outputPath);
        return { ok: false, error: 'O preview gerado não é um arquivo de mídia válido (moov atom ausente).' };
      }
    }
    return { ok: true, filePath: outputPath, size: stat.size };
  } catch {
    return { ok: false, error: 'O preview não pôde ser lido.' };
  }
}

/** Executa o FFmpeg para extrair o trecho (args estruturados, sem shell). */
function runFfmpegPreview({ inputUrl, outputPath, ffmpegPath, headers }) {
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

/** Executa o yt-dlp para baixar um trecho curto de preview. */
function runYtDlpPreview({ url, quality, outputPath, ytdlpPath }) {
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

/** Remove um arquivo de preview (silencioso se já não existir). */
export function clearPreview(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Remove previews mais antigos que PREVIEW_CACHE_MS. Retorna quantos removeu. */
export function cleanOldPreviews(tempDir, { now = Date.now(), maxAgeMs = PREVIEW_CACHE_MS } = {}) {
  const previewDir = getPreviewDir(tempDir);
  let removed = 0;
  let files;
  try {
    files = fs.readdirSync(previewDir);
  } catch {
    return 0;
  }
  for (const file of files) {
    const filePath = path.join(previewDir, file);
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        removed++;
      }
    } catch {
      /* arquivo pode ter sido removido em paralelo */
    }
  }
  return removed;
}