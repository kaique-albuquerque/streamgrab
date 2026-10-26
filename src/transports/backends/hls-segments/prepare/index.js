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

import { parseSegmentPlaylist } from '../../../../hls.js';

import { inspectHlsSegmentSupport, createUnsupportedResult } from '../inspect.js';
import { runSegmentDownloader } from '../downloader.js';

import { fetchMediaPlaylist } from './playlist.js';
import { createCheckpointEmitter } from './checkpoint.js';
import { downloadKeyFiles, downloadMapFiles, writeLocalPlaylist } from './assets.js';
import { buildSegmentQueue } from './queue.js';

/** Prepara o download de uma playlist HLS para arquivos locais. */
export async function prepareHlsSegmentDownloadToLocal({
  url, headers = {}, signal, tmpDir, checkpoint,
  preferredVariantPath = '', onProgress, adaptive, onAdaptiveDecision, onCheckpoint,
} = {}) {
  const workDir = tmpDir || fs.mkdtempSync(path.join(os.tmpdir(), 'sg-hls-segments-'));
  const ownsTmpDir = !tmpDir;

  try {
    // 1. Fetch & parse playlist
    const { mediaText, mediaBase } = await fetchMediaPlaylist({ url, headers, preferredVariantPath });

    // 2. Validate support
    const support = inspectHlsSegmentSupport(mediaText);
    if (!support.ok) return support;

    const parsed = parseSegmentPlaylist(mediaText);
    if (!parsed.segments.length) {
      return createUnsupportedResult('hls-no-segments', 'Playlist media nao contem segmentos.');
    }

    // 3. Checkpoint factory
    const emitCheckpoint = createCheckpointEmitter({
      parsed, mediaBase, preferredVariantPath, onCheckpoint,
    });

    // 4. Download keys & maps
    const keyFiles = await downloadKeyFiles({ parsed, mediaBase, headers, signal, workDir });
    const mapFiles = await downloadMapFiles({ parsed, mediaBase, headers, signal, workDir });

    // 5. Build segment queue (restore from checkpoint)
    const { queue, segMap, completedSegmentIds, segmentStatuses } = buildSegmentQueue({
      parsed, mediaBase, workDir, preferredVariantPath, checkpoint,
    });

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
    if (failed > 0) {
      return {
        ok: false,
        code: 'SEGMENT_RETRY_EXHAUSTED',
        error: 'Falha ao baixar um ou mais segmentos.',
        failed,
      };
    }

    // 7. Write local playlist
    const localPlaylist = writeLocalPlaylist({
      workDir, mediaText, segMap, keyFiles, mapFiles, mediaBase,
    });
    const extraArgs = parsed.keys.length > 0 || parsed.maps.length > 0
      ? ['-allowed_extensions', 'ALL']
      : [];

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
