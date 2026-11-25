/**
 * Runner: subtitle downloading and embedding (P12).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { normalizeHeaders, DEFAULT_USER_AGENT } from '../../../utils.js';
import { ffmpegService } from '../../../ffmpeg/service.js';
import { containerOutputArgs, normalizeContainer } from '../lifecycle/container.js';

/**
 * Downloads and optionally embeds subtitles into a video file.
 *
 * - MP4: legenda queimada (hardcode) via `-vf subtitles=...` (comportamento
 *   histórico — MP4 não aceita `srt` como faixa de forma universal).
 * - MKV: legenda como **faixa** (`-c:v copy -c:s srt`), sem re-encode.
 *   Nunca grava conteúdo MP4 sobre um path `.mkv`.
 *
 * @param {object} params
 * @param {string} params.videoPath
 * @param {Array<{uri: string, language: string, name: string}>} params.subtitleTracks
 * @param {string[]} params.selectedLanguages
 * @param {boolean} params.embedSubs — if true, embed via FFmpeg
 * @param {object} [params.headers]
 * @param {AbortSignal} [params.signal]
 * @param {Function} [params.onLog]
 * @param {Function} [params.ffmpegRun] - Injetável (testes); default: serviço real
 * @param {typeof fetch} [params.fetchImpl] - Injetável (testes)
 */
export async function embedSubtitles({
  videoPath, subtitleTracks, selectedLanguages,
  embedSubs = false, headers = {}, signal, onLog,
  ffmpegRun = ffmpegService.run.bind(ffmpegService),
  fetchImpl = globalThis.fetch,
}) {
  if (!videoPath || !fs.existsSync(videoPath)) {
    return { ok: false, error: 'Arquivo de video nao encontrado para embutir legendas.' };
  }
  if (!Array.isArray(subtitleTracks) || subtitleTracks.length === 0) return { ok: true };
  if (!Array.isArray(selectedLanguages) || selectedLanguages.length === 0) return { ok: true };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-subs-'));
  try {
    const wantAll = selectedLanguages.includes('all');
    const wanted = subtitleTracks.filter((t) => wantAll || selectedLanguages.includes(t.language));
    if (wanted.length === 0) return { ok: true };

    // Download subtitle files
    const subFiles = [];
    for (const track of wanted) {
      if (!track.uri) continue;
      const ext = track.uri.match(/\.(vtt|srt|ass|ssa)$/i)?.[1] || 'vtt';
      const subFile = path.join(tmpDir, `sub_${track.language || 'und'}.${ext}`);
      try {
        const requestHeaders = normalizeHeaders({ 'User-Agent': DEFAULT_USER_AGENT, ...headers });
        const res = await fetchImpl(track.uri, {
          headers: requestHeaders, signal,
          redirect: 'follow', signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          onLog?.(`[subs] falha ao baixar legenda ${track.language}: HTTP ${res.status}`);
          continue;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        await fs.promises.writeFile(subFile, buf);
        subFiles.push({ file: subFile, language: track.language || 'und' });
      } catch (err) {
        onLog?.(`[subs] falha ao baixar legenda ${track.language}: ${err?.message || err}`);
      }
    }

    if (subFiles.length === 0) {
      onLog?.('[subs] nenhuma legenda baixada com sucesso');
      return { ok: true };
    }

    // Soft subs: copy files next to video
    if (!embedSubs) {
      const videoDir = path.dirname(videoPath);
      const videoBase = path.basename(videoPath, path.extname(videoPath));
      for (const sub of subFiles) {
        const dest = path.join(videoDir, `${videoBase}.${sub.language}${path.extname(sub.file)}`);
        await fs.promises.copyFile(sub.file, dest).catch(() => {});
      }
      onLog?.(`[subs] ${subFiles.length} legenda(s) salva(s) ao lado do video`);
      return { ok: true };
    }

    // Embed por contêiner: MP4 queima (hardcode), MKV usa faixa (soft subs).
    const container = normalizeContainer(path.extname(videoPath).slice(1));
    const ext = path.extname(videoPath);
    // O temp preserva a extensão final: um `.mkv` nunca recebe conteúdo MP4.
    const tmpOutput = `${videoPath}.subbed${ext}`;

    const inputs = ['-i', videoPath];
    for (const sub of subFiles) inputs.push('-i', sub.file);

    const ffmpegArgs = [
      '-hide_banner', '-loglevel', 'error', '-nostats', '-y',
      ...inputs, '-progress', 'pipe:1',
    ];

    if (container === 'mkv') {
      // Legenda como faixa, sem re-encode do vídeo.
      ffmpegArgs.push('-map', '0', '-c:v', 'copy', '-c:a', 'copy');
      for (let i = 0; i < subFiles.length; i++) {
        ffmpegArgs.push('-map', `${i + 1}:0`, '-c:s', 'srt');
        ffmpegArgs.push(`-metadata:s:s:${i}`, `language=${subFiles[i].language}`);
      }
    } else {
      // Hardcode (comportamento histórico do MP4).
      const filters = subFiles.map((sub) => {
        const escaped = sub.file.replace(/'/g, "\\'").replace(/:/g, '\\:');
        return `subtitles='${escaped}':force_style='FontSize=24'`;
      });
      ffmpegArgs.push('-vf', filters.join(','));
      ffmpegArgs.push('-c:v', 'libx264', '-crf', '18', '-preset', 'fast');
      ffmpegArgs.push('-c:a', 'copy', ...containerOutputArgs(container));
    }

    ffmpegArgs.push(tmpOutput);
    onLog?.(`[subs] embutindo ${subFiles.length} legenda(s) no video (${container}) via FFmpeg`);

    const { promise, stop } = ffmpegRun({ args: ffmpegArgs, onProgress: null });
    const onAbort = () => stop();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await promise;
      if (signal?.aborted) {
        try { await fs.promises.unlink(tmpOutput).catch(() => {}); } catch { /* ignora */ }
        return { ok: false, error: 'Operacao cancelada.' };
      }
      if (!result.ok) {
        try { await fs.promises.unlink(tmpOutput).catch(() => {}); } catch { /* ignora */ }
        onLog?.(`[subs] FFmpeg embed falhou (code=${result.code}): ${String(result.stderr || '').slice(0, 300)}`);
        // Fallback: soft subs
        const videoDir = path.dirname(videoPath);
        const videoBase = path.basename(videoPath, path.extname(videoPath));
        for (const sub of subFiles) {
          const dest = path.join(videoDir, `${videoBase}.${sub.language}${path.extname(sub.file)}`);
          await fs.promises.copyFile(sub.file, dest).catch(() => {});
        }
        return { ok: true };
      }
      await fs.promises.rename(tmpOutput, videoPath);
      onLog?.('[subs] legendas embutidas com sucesso');
      return { ok: true };
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignora */ }
  }
}
