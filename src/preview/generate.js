/**
 * Orquestração do preview: valida, gera o arquivo e confere o resultado.
 */

import fs from 'node:fs';
import path from 'node:path';
import { canPreview, getPreviewDir, needsYtDlp } from './eligibility.js';
import { runFfmpegPreview } from './ffmpeg.js';
import { runYtDlpPreview } from './ytdlp.js';
import { clearPreview } from './cache.js';

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
  const failure = await createPreviewFile({ url, quality, sourceType, outputPath, ffmpegPath, ytdlpPath, headers });
  if (failure) return failure;

  return validatePreviewFile(outputPath);
}

/**
 * Escolhe a estratégia (yt-dlp ou FFmpeg) e grava o arquivo de preview.
 * Retorna uma resposta de erro ou `null` em caso de sucesso.
 */
async function createPreviewFile({ url, quality, sourceType, outputPath, ffmpegPath, ytdlpPath, headers }) {
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
  return null;
}

/** Confere tamanho e container do arquivo gerado. */
function validatePreviewFile(outputPath) {
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
