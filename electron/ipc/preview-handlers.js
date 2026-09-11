/**
 * Handler IPC de preview de mídia — SPEC-06.
 *
 * Gera um trecho curto (até 60s) do vídeo para o usuário conferir o conteúdo
 * antes de baixar. Cache em memória de 30 min para não regerar o mesmo preview.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ipcMain } from 'electron';
import { pathToFileURL } from 'node:url';
import { binName, packagedBinaryPath } from '../../src/core/binaries.js';
import { loadConfig, applyProviderHeaders } from '../../src/cli/config.js';
import { isSafeHttpUrl, isSafeMediaSelection } from '../security.js';
import { PROJECT_ROOT } from './state.js';

const previewCache = new Map(); // `${url}|${quality}` -> { path, time }

/** Fontes elegíveis para preview (espelha src/preview.js). */
function canPreviewSource(sourceType) {
  return ['hls', 'dash', 'direct', 'youtube', 'social', 'ytdlp'].includes(String(sourceType || '').toLowerCase());
}

/** Resolve caminho do yt-dlp: empacotado > build/extraResources > vendor/local > PATH. */
function getYtDlpCommand() {
  const packaged = packagedBinaryPath(binName('yt-dlp'));
  if (packaged && fs.existsSync(packaged)) return packaged;
  const buildPath = path.join(PROJECT_ROOT, 'build', 'extraResources', 'bin', binName('yt-dlp'));
  if (fs.existsSync(buildPath)) return buildPath;
  const localPath = path.join(PROJECT_ROOT, 'vendor', 'yt-dlp', binName('yt-dlp'));
  if (fs.existsSync(localPath)) return localPath;
  return 'yt-dlp';
}

export function registerPreviewHandlers() {
  ipcMain.handle('preview:generate', async (_event, rawPayload) => {
    const { app } = await import('electron');
    const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
    const url = typeof payload.url === 'string' ? payload.url.trim() : '';
    const quality = typeof payload.quality === 'string' ? payload.quality.trim() : '';
    const sourceType = typeof payload.sourceType === 'string' ? payload.sourceType : '';

    if (!isSafeHttpUrl(url)) return { ok: false, error: 'URL inválida para preview.' };
    if (quality && !isSafeMediaSelection(quality)) return { ok: false, error: 'Qualidade inválida para preview.' };

    const { generatePreview, clearPreview } = await import('../../src/preview.js');
    if (!canPreviewSource(sourceType)) {
      return { ok: false, error: 'Preview não disponível para este tipo de mídia.' };
    }

    const cacheKey = `${url}|${quality}`;
    const cached = previewCache.get(cacheKey);
    if (cached) {
      if (Date.now() - cached.time < 30 * 60 * 1000) {
        try {
          const stat = fs.statSync(cached.path);
          if (stat.size > 0) {
            return {
              ok: true,
              filePath: cached.path,
              srcUrl: pathToFileURL(cached.path).toString(),
              size: stat.size,
              mimeType: 'video/mp4',
              cached: true,
            };
          }
        } catch {
          /* arquivo sumiu: gera de novo */
        }
        previewCache.delete(cacheKey);
      } else {
        clearPreview(cached.path);
        previewCache.delete(cacheKey);
      }
    }

    const { getFfmpegCommand } = await import('../../src/ffmpeg/service.js');
    const { formatHeaders } = await import('../../src/ffmpeg/muxer.js');

    const config = loadConfig(PROJECT_ROOT, { log: () => {} });
    const mergedHeaders = applyProviderHeaders({ url, headers: config.headers, argv: ['--hotmart'] });
    const headerStr = formatHeaders(mergedHeaders);

    const result = await generatePreview({
      url,
      quality,
      sourceType,
      ffmpegPath: getFfmpegCommand(),
      ytdlpPath: getYtDlpCommand(),
      tempDir: app.getPath('temp'),
      headers: headerStr,
    });

    if (result.ok && result.filePath) {
      previewCache.set(cacheKey, { path: result.filePath, time: Date.now() });
      return { ...result, srcUrl: pathToFileURL(result.filePath).toString(), mimeType: 'video/mp4' };
    }
    return result;
  });

  ipcMain.handle('preview:read-file', async (_event, rawPayload) => {
    const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
    const filePath = typeof payload.filePath === 'string' ? payload.filePath : '';
    if (!filePath) return { ok: false, error: 'Caminho não informado.' };
    try {
      const data = fs.readFileSync(filePath);
      return { ok: true, data: data.toString('base64'), mimeType: 'video/mp4' };
    } catch {
      return { ok: false, error: 'Não foi possível ler o arquivo de preview.' };
    }
  });

  ipcMain.handle('preview:clear', async (_event, rawPayload) => {
    const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
    const filePath = typeof payload.filePath === 'string' ? payload.filePath : '';
    if (!filePath) return { ok: false };
    const { clearPreview } = await import('../../src/preview.js');
    clearPreview(filePath);
    for (const [key, value] of previewCache) {
      if (value.path === filePath) previewCache.delete(key);
    }
    return { ok: true };
  });
}
