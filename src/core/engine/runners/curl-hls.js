/**
 * Runner: curl-impersonate HLS download + FFmpeg mux.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startDownload } from '../../../ffmpeg.js';
import { CurlImpersonateTransport } from '../../../transports/curl.js';
import { parsePlaylistText } from '../../../hls.js';
import { progressUpdate, abortOutcome, segmentProgressToEngine, safePathname, makeFfmpegProgress } from '../helpers.js';

/**
 * Downloads HLS via curl-impersonate segments, then muxes with FFmpeg.
 */
export async function runCurlHlsDownload(
  url, output, headers, signal, onProgress,
  transport = null, onLog = () => {},
  { preferredVariantPath = '' } = {}
) {
  if (!transport) {
    transport = CurlImpersonateTransport.resolve({ headers });
    if (!transport) return null;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-curl-'));
  const segmentStartedAtMs = Date.now();
  try {
    let mediaText, mediaBase;
    const { text: firstText, finalUrl: firstFinal } = await transport.getText(url, { signal });
    const info = parsePlaylistText(firstText, firstFinal || url);

    if (info.kind === 'master' && info.variants.length > 0) {
      const matched = preferredVariantPath
        ? info.variants.find((v) =>
            safePathname(new URL(v.uri, info.baseUrl || firstFinal || url).toString()) === preferredVariantPath)
        : null;
      const picked = matched || info.variants[0];
      const variantUrl = new URL(picked.uri, info.baseUrl || firstFinal || url).toString();
      ({ text: mediaText, finalUrl: mediaBase } = await transport.getText(variantUrl, { signal }));
      mediaBase = mediaBase || variantUrl;
    } else {
      mediaText = firstText;
      mediaBase = firstFinal || url;
    }

    const result = await transport.downloadSegments({
      mediaText, mediaBase, tmpDir, signal,
      onProgress: (p) => onProgress?.(segmentProgressToEngine(p, segmentStartedAtMs)),
    });
    if (!result.ok) {
      const reason = result.error === 'interrupted' ? 'interrupted' : `segmentos (${result.error})`;
      if (signal?.aborted) return abortOutcome(signal);
      return { ok: false, code: 'CURL_SEGMENTS_FAILED', error: `Falha ao baixar ${reason}.` };
    }
    if (signal?.aborted) return abortOutcome(signal);

    onProgress?.({ stage: 'merging', percent: 90, message: 'Juntando segmentos com FFmpeg' });
    const { promise, stop } = startDownload({
      url: result.localPlaylist, output, headers: {},
      modeIndex: 0, extraArgs: result.extraArgs,
      onProgress: makeFfmpegProgress((u) => onProgress?.({ ...u, stage: 'merging' }), 0),
    });
    const onAbort = () => stop();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const muxResult = await promise;
      if (signal?.aborted) return abortOutcome(signal);
      if (muxResult.ok) {
        onProgress?.({ ...progressUpdate(0, 0, Date.now()), percent: 100, stage: 'merging' });
        return { ok: true };
      }
      return {
        ok: false,
        code: 'FFMPEG_FAILED',
        error: `ffmpeg saiu com codigo ${muxResult.code ?? 'desconhecido'}`,
        detail: String(muxResult.stderr || '').slice(-2000),
      };
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  } catch (err) {
    if (signal?.aborted) return abortOutcome(signal);
    return { ok: false, code: err?.code || 'CURL_DOWNLOAD_FAILED', error: err.message, status: err?.status };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignora */ }
  }
}
