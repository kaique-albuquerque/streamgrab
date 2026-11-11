/**
 * Requisições yt-dlp — monta os parâmetros comuns às estratégias que baixam
 * pelo yt-dlp (mux e single progressivo).
 */

import { runYtDlpDownload } from '../../../transports/ytdlp-runner.js';

/**
 * Parâmetros de download do yt-dlp a partir do job.
 *
 * `onProgress` normaliza o palco para 'downloading' — o yt-dlp pode emitir
 * outros valores e o engine espera um palco conhecido.
 */
export function buildYtDlpRequest(job, { output, headers, signal, onProgress, formatId }) {
  return {
    url: job.url,
    formatId,
    output,
    headers,
    auth: job.meta?.auth || {},
    signal,
    onProgress: (p) => onProgress?.({ ...p, stage: p?.stage || 'downloading' }),
    subtitleLanguages: job.meta?.subtitleLanguages || [],
    embedSubs: job.meta?.embedSubs === true,
  };
}

/**
 * Executa o download via yt-dlp com os parâmetros do job.
 *
 * `ytdlpDownload` é injetável (testes usam mocks determinísticos).
 */
export async function downloadWithYtDlp(job, options, { ytdlpDownload = runYtDlpDownload } = {}) {
  return ytdlpDownload(buildYtDlpRequest(job, options));
}