/**
 * Estratégias de mux — streams separados (video+audio) combinados em um arquivo.
 *
 * Cada função recebe o contexto do run() e devolve:
 * { ok: true } | { ok: false, ... } | { paused: true } | { cancelled: true } | null
 */

import { usesYtDlpDownload } from './yt-dlp-routing.js';
import { downloadWithYtDlp } from './yt-dlp-request.js';
import { runMuxDownload, runMuxMultiDownload } from '../runners/index.js';
import { runTurboMuxDownload } from './turbo.js';

/**
 * Handles 'mux' strategy: yt-dlp (YouTube/redes sociais), turbo mux, or
 * fallback fetch mux.
 */
export async function runMuxStrategy(job, prepared, output, headers, signal, onProgress, onLog, {
  sourceType, turbo, turboChunks, ytdlpDownload,
}) {
  if (usesYtDlpDownload(sourceType, job.url)) {
    const height = prepared.chosenFormat?.height || 1080;
    const formatSelector = `bestvideo[height<=${height}][vcodec*=avc1]+bestaudio[acodec*=mp4a]/best[height<=${height}]`;
    onLog?.(`[yt-dlp] mux strategy: baixando com format="${formatSelector}" via yt-dlp`);
    try {
      await downloadWithYtDlp(job, { output, headers, signal, onProgress, formatId: formatSelector }, { ytdlpDownload });
      return { ok: true };
    } catch (err) {
      onLog?.(`[yt-dlp] mux fallback para fetch direto: ${err?.message || err}`);
    }
  }
  if (turbo) {
    onLog?.('[turbo] mux strategy: tentando download paralelo dos streams');
    const result = await runTurboMuxDownload(prepared, output, headers, signal, onProgress, onLog, turboChunks);
    if (result?.ok) return result;
    if (result && !result.ok) onLog?.(`[turbo] mux falhou, fallback para runMuxDownload: ${result.error}`);
  }
  return runMuxDownload(prepared, output, headers, signal, onProgress);
}

// -- mux-multi strategy -----------------------------------------------------

export async function runMuxMultiStrategy(prepared, output, headers, signal, onProgress) {
  return runMuxMultiDownload(prepared, output, headers, signal, onProgress);
}