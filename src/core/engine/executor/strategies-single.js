/**
 * Estratégias de arquivo único — yt-dlp progressivo (redes sociais) e HTTP direto.
 *
 * Cada função recebe o contexto do run() e devolve:
 * { ok: true } | { ok: false, ... } | { paused: true } | { cancelled: true } | null
 */

import { downloadWithYtDlp } from './yt-dlp-request.js';
import { tryTurboDownload } from './turbo.js';

/**
 * Rede social com formato progressivo (arquivo unico com video+audio): baixa
 * pelo yt-dlp em vez do HTTP direto. Devolve null quando o yt-dlp falha para o
 * executor cair no download HTTP (comportamento anterior).
 */
export async function runYtDlpSingleStrategy(job, prepared, output, headers, signal, onProgress, onLog, {
  ytdlpDownload,
} = {}) {
  const formatId = prepared?.chosenFormat?.formatId || 'best';
  onLog?.(`[yt-dlp] download progressivo: format="${formatId}" via yt-dlp`);
  try {
    await downloadWithYtDlp(job, { output, headers, signal, onProgress, formatId }, { ytdlpDownload });
    return { ok: true };
  } catch (err) {
    onLog?.(`[yt-dlp] download progressivo falhou, fallback para HTTP direto: ${err?.message || err}`);
    return null;
  }
}

// -- direct download (HTTP) -------------------------------------------------

export async function runDirectStrategy(url, output, headers, signal, onProgress, onLog, { turbo, turboChunks, atomic }) {
  if (turbo) {
    const turboResult = await tryTurboDownload(url, output, headers, signal, onProgress, onLog, turboChunks);
    if (turboResult) return turboResult;
  }
  const { runStreamDownload } = await import('../runners/index.js');
  return runStreamDownload(url, output, headers, signal, onProgress, atomic);
}