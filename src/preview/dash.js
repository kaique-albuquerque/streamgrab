/**
 * Preview de DASH: baixa init + primeiros segmentos e remuxa um trecho.
 *
 * O FFmpeg nao le `.mpd` sem o demuxer `dash` (ausente em several builds,
 * ex.: Homebrew). A alternativa e baixar o init + os primeiros N segmentos
 * via HTTP e concatenar — o mesmo caminho do download completo, so que curto.
 */

import fs from 'node:fs';

import { dashMediaSegmentUrls, fetchDashManifestText, parseDashManifest } from '../dash.js';
import { DEFAULT_USER_AGENT } from '../utils.js';
import { PREVIEW_DURATION_SECONDS } from './constants.js';

/** Baixa uma URL para um Buffer (mesmos headers do preview). */
async function fetchBuffer(url, headers) {
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Gera um arquivo de preview a partir de um MPD DASH.
 * Retorna `{ ok: true }` ou lança Error com mensagem amigável.
 */
export async function runDashPreview({ url, outputPath, ffmpegPath, headers = '' }) {
  const headerObj = {};
  for (const line of String(headers).split('\r\n')) {
    const i = line.indexOf(':');
    if (i > 0) headerObj[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const manifest = await fetchDashManifestText(url, headerObj);
  const parsed = parseDashManifest(manifest.text, manifest.url || url);
  const videoRep = parsed.videoRepresentations?.[0];
  if (!videoRep) throw new Error('Manifesto DASH sem representacao de video.');

  const tpl = videoRep.segmentTemplate;
  const total = Number(parsed.durationSeconds) || 0;
  // No maximo 60s de preview: pega so os primeiros segmentos necessarios.
  const urls = dashMediaSegmentUrls(tpl, total, PREVIEW_DURATION_SECONDS);
  if (urls.length === 0) throw new Error('Manifesto DASH sem segmentos de media.');

  const initData = tpl?.initialization ? await fetchBuffer(tpl.initialization, headerObj) : Buffer.alloc(0);
  const parts = [];
  for (const u of urls) parts.push(await fetchBuffer(u, headerObj));

  const joined = `${outputPath}.dashsrc.mp4`;
  fs.writeFileSync(joined, Buffer.concat([initData, ...parts]));
  try {
    const { runFfmpegPreview } = await import('./ffmpeg.js');
    // Arquivo local: `-headers` e opcao de protocolo HTTP e quebra o FFmpeg.
    await runFfmpegPreview({ inputUrl: joined, outputPath, ffmpegPath, headers: '', isRemote: false });
  } finally {
    try { fs.rmSync(joined, { force: true }); } catch { /* ignora */ }
  }
}

/** Monta os headers HTTP padrao do preview DASH. */
export function dashPreviewHeaders(headers = '') {
  const base = String(headers || '');
  return base.includes('User-Agent:') ? base : `${base}User-Agent: ${DEFAULT_USER_AGENT}\r\n`;
}

export default { runDashPreview, dashPreviewHeaders };