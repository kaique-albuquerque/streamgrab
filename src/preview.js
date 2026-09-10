/**
 * Preview de mídia — gera um trecho curto (até 60s) para o usuário
 * conferir o conteúdo antes de baixar o arquivo completo.
 *
 * SPEC-06: docs/specs/06-preview-de-midia.md
 *
 * Estratégia:
 *  - mídia direta com suporte a Range: baixa apenas os primeiros bytes;
 *  - HLS/DASH/YouTube/redes sociais: FFmpeg grava os primeiros N segundos
 *    com `-c copy` (rápido, sem reencode).
 *
 * Este módulo não depende do Electron: recebe ffmpegPath e tempDir por
 * injeção, permitindo testes em Node puro.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const PREVIEW_DURATION_SECONDS = 60;
export const PREVIEW_MAX_BYTES = 10 * 1024 * 1024; // 10 MB para mídia direta
export const PREVIEW_TIMEOUT_MS = 30000;
export const PREVIEW_CACHE_MS = 30 * 60 * 1000; // 30 min
export const PREVIEW_DIR_NAME = 'streamgrab-preview';

/** Fontes elegíveis para preview (DRM sempre excluído). */
export const PREVIEWABLE_SOURCES = Object.freeze(['hls', 'dash', 'direct', 'youtube', 'social', 'ytdlp']);

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
 * @param {string} opts.tempDir      Diretório temporário base
 * @param {string} [opts.headers]    Cabeçalhos HTTP já formatados (opcional)
 * @returns {Promise<{ok: boolean, filePath?: string, size?: number, error?: string}>}
 */
export async function generatePreview({ url, quality, sourceType, ffmpegPath, tempDir, headers = '' }) {
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

  try {
    await runFfmpegPreview({ inputUrl, outputPath, ffmpegPath, headers });
  } catch (err) {
    clearPreview(outputPath);
    return { ok: false, error: err?.message || 'Falha ao gerar o preview.' };
  }

  try {
    const stat = fs.statSync(outputPath);
    if (!stat.size) {
      clearPreview(outputPath);
      return { ok: false, error: 'O preview gerado ficou vazio.' };
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
    if (headers) args.splice(args.indexOf('-i'), 0, '-headers', headers);

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