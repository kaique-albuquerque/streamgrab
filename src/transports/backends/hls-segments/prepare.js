/**
 * HLS segments — preparation and orchestration.
 *
 * Fetches the playlist, downloads keys/maps, builds the segment queue,
 * delegates concurrent download to the worker, and writes the local
 * playlist for FFmpeg consumption.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { fetchPlaylistText, parsePlaylistText, parseSegmentPlaylist } from '../../../hls.js';
import { rewritePlaylist, extForUri } from '../../curl/index.js';
import { createSegmentCheckpoint, createSegmentTaskId } from '../../../core/models/index.js';

import { inspectHlsSegmentSupport, createUnsupportedResult } from './inspect.js';
import { fetchBinary, safePathname, segmentRepresentationId, localSegmentPath } from './fetch.js';
import { runSegmentDownloader } from './downloader.js';

export async function prepareHlsSegmentDownloadToLocal({
  url, headers = {}, signal, tmpDir, checkpoint,
  preferredVariantPath = '', onProgress, adaptive, onAdaptiveDecision, onCheckpoint,
} = {}) {
  const workDir = tmpDir || fs.mkdtempSync(path.join(os.tmpdir(), 'sg-hls-segments-'));
  const ownsTmpDir = !tmpDir;

  try {
    // 1. Fetch & parse playlist
    let mediaText, mediaBase;
    const first = await fetchPlaylistText(url, headers);
    const info = parsePlaylistText(first.text, first.url || url);
    if (info.kind === 'master' && info.variants.length > 0) {
      const matched = preferredVariantPath
        ? info.variants.find((v) => safePathname(new URL(v.uri, info.baseUrl || first.url || url).toString()) === preferredVariantPath)
        : null;
      const picked = matched || info.variants[0];
      const variantUrl = new URL(picked.uri, info.baseUrl || first.url || url).toString();
      const variant = await fetchPlaylistText(variantUrl, headers);
      mediaText = variant.text;
      mediaBase = variant.url || variantUrl;
    } else {
      mediaText = first.text;
      mediaBase = first.url || url;
    }

    // 2. Validate support
    const support = inspectHlsSegmentSupport(mediaText);
    if (!support.ok) return support;

    const parsed = parseSegmentPlaylist(mediaText);
    if (!parsed.segments.length) {
      return createUnsupportedResult('hls-no-segments', 'Playlist media nao contem segmentos.');
    }

    // 3. Checkpoint factory
    const emitCheckpoint = ({ taskState = 'downloading', completedSegmentIds = [], segmentStatuses = new Map(), diagnostics = {} } = {}) => {
      const cp = createSegmentCheckpoint({
        backend: 'hls-segments', manifestUrl: mediaBase, outputMode: 'single', taskState,
        segments: parsed.segments.map((segment, index) => {
          const segmentId = createSegmentTaskId({ stream: 'video', representationId: segmentRepresentationId(preferredVariantPath, mediaBase), segmentIndex: index });
          return { id: segmentId, stream: 'video', representationId: segmentRepresentationId(preferredVariantPath, mediaBase), index, url: new URL(segment.uri, mediaBase).toString(), status: segmentStatuses.get(segmentId) || 'pending' };
        }),
        completedSegmentIds, diagnostics,
      });
      onCheckpoint?.(cp);
      return cp;
    };

    // 4. Download keys & maps
    const keyFiles = new Map();
    for (const key of parsed.keys) {
      const keyUrl = new URL(key.uri, mediaBase).toString();
      const local = path.join(workDir, `key_${keyFiles.size}.bin`);
      const r = await fetchBinary(keyUrl, headers, signal);
      fs.writeFileSync(local, r.data);
      keyFiles.set(keyUrl, local);
    }

    const fallbackExt = parsed.maps.length > 0 ? 'mp4' : 'ts';
    const mapFiles = new Map();
    for (const map of parsed.maps) {
      const mapUrl = new URL(map.uri, mediaBase).toString();
      const local = path.join(workDir, `init_${mapFiles.size}.${extForUri(map.uri, 'mp4')}`);
      const r = await fetchBinary(mapUrl, headers, signal);
      fs.writeFileSync(local, r.data);
      mapFiles.set(mapUrl, local);
    }

    // 5. Build segment queue (restore from checkpoint)
    const segMap = new Map();
    const completedSegmentIds = new Set();
    const segmentStatuses = new Map();
    const checkpointCompletedIds = new Set(
      Array.isArray(checkpoint?.completedSegmentIds)
        ? checkpoint.completedSegmentIds.map((v) => String(v || '')).filter(Boolean) : []
    );
    const queue = parsed.segments.map((segment, index) => ({
      index, url: new URL(segment.uri, mediaBase).toString(), uri: segment.uri,
      local: localSegmentPath(workDir, index, segment.uri, fallbackExt),
      segmentId: createSegmentTaskId({ stream: 'video', representationId: segmentRepresentationId(preferredVariantPath, mediaBase), segmentIndex: index }),
    }));

    for (const item of queue) {
      if (checkpointCompletedIds.has(item.segmentId) && fs.existsSync(item.local)) {
        completedSegmentIds.add(item.segmentId);
        segmentStatuses.set(item.segmentId, 'completed');
        segMap.set(item.url, item.local);
      }
    }

    emitCheckpoint({
      taskState: 'downloading', completedSegmentIds: [], segmentStatuses,
      diagnostics: {
        segmentCount: parsed.segments.length, keyCount: parsed.keys.length,
        mapCount: parsed.maps.length, resumedSegmentCount: completedSegmentIds.size,
      },
    });

    // 6. Concurrent segment download
    const { totalBytes, failed, cancelled, adaptive: adaptiveResult } = await runSegmentDownloader({
      queue, completedSegmentIds, segmentStatuses, segMap,
      mediaBase, parsedSegments: parsed.segments, parsedKeys: parsed.keys, parsedMaps: parsed.maps,
      headers, signal, onProgress, onAdaptiveDecision, emitCheckpoint,
      preferredVariantPath, adaptive,
    });

    if (cancelled) return { ok: false, code: 'CANCELLED', error: 'Operacao cancelada.' };
    if (failed > 0) return { ok: false, code: 'SEGMENT_RETRY_EXHAUSTED', error: 'Falha ao baixar um ou mais segmentos.', failed };

    // 7. Write local playlist
    const localPlaylist = path.join(workDir, 'local.m3u8');
    fs.writeFileSync(localPlaylist, rewritePlaylist(mediaText, segMap, keyFiles, mapFiles, mediaBase), 'utf8');
    const extraArgs = parsed.keys.length > 0 || parsed.maps.length > 0 ? ['-allowed_extensions', 'ALL'] : [];

    return {
      ok: true, localPlaylist, extraArgs, totalBytes, tmpDir: workDir,
      checkpoint: emitCheckpoint({
        taskState: 'downloaded', completedSegmentIds: [...completedSegmentIds], segmentStatuses,
        diagnostics: {
          segmentCount: parsed.segments.length, keyCount: parsed.keys.length,
          mapCount: parsed.maps.length, totalBytes, resumedSegmentCount: completedSegmentIds.size,
        },
      }),
      diagnostics: {
        segmentCount: parsed.segments.length, keyCount: parsed.keys.length,
        mapCount: parsed.maps.length, resumedSegmentCount: completedSegmentIds.size,
        workDir, adaptive: adaptiveResult,
      },
      cleanup: ownsTmpDir ? () => fs.rmSync(workDir, { recursive: true, force: true }) : () => {},
    };
  } catch (err) {
    if (ownsTmpDir) {
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignora */ }
    }
    return {
      ok: false, code: err?.code || 'HLS_SEGMENTS_FAILED',
      error: err?.message || 'Falha ao preparar HLS segmentado.',
      status: err?.status || 0, fallback: 'ffmpeg',
    };
  }
}
