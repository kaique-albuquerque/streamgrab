import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { fetchPlaylistText, parsePlaylistText, parseSegmentPlaylist } from '../../hls.js';
import { rewritePlaylist, extForUri } from '../curl.js';
import { createAdaptiveController, normalizeAdaptiveControllerOptions } from '../adaptive-controller.js';
import { createSegmentCheckpoint, createSegmentTaskId } from '../../core/models.js';

const SEGMENT_WORKERS = 6;
const SEGMENT_ATTEMPTS = 3;

function createUnsupportedResult(reasonCode, reason) {
  return {
    ok: false,
    code: 'MANIFEST_UNSUPPORTED',
    reasonCode,
    error: reason,
    fallback: 'ffmpeg',
  };
}

function hasLine(text, pattern) {
  return pattern.test(String(text || ''));
}

export function inspectHlsSegmentSupport(text) {
  if (!String(text || '').includes('#EXTM3U')) {
    return createUnsupportedResult('not-hls', 'Manifesto nao parece ser HLS.');
  }
  if (hasLine(text, /^#EXT-X-BYTERANGE:/m)) {
    return createUnsupportedResult('hls-byterange-unsupported', 'EXT-X-BYTERANGE ainda nao e suportado pelo backend segmentado.');
  }
  if (hasLine(text, /^#EXT-X-PLAYLIST-TYPE:\s*EVENT/im)) {
    return createUnsupportedResult('hls-live-unsupported', 'Playlist EVENT ainda nao e suportada pelo backend segmentado.');
  }
  if (!hasLine(text, /^#EXT-X-ENDLIST\s*$/m)) {
    return createUnsupportedResult('hls-live-unsupported', 'Somente playlists VOD com EXT-X-ENDLIST sao suportadas nesta fase.');
  }
  if (hasLine(text, /^#EXT-X-KEY:.*METHOD=SAMPLE-AES/im)) {
    return createUnsupportedResult('hls-sample-aes-unsupported', 'SAMPLE-AES ainda nao e suportado pelo backend segmentado.');
  }
  if (hasLine(text, /^#EXT-X-SESSION-KEY:/m)) {
    return createUnsupportedResult('hls-session-key-unsupported', 'EXT-X-SESSION-KEY ainda nao e suportado pelo backend segmentado.');
  }
  return { ok: true };
}

async function fetchBinary(url, headers, signal) {
  const res = await fetch(url, {
    headers,
    redirect: 'follow',
    signal,
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { data: buf, finalUrl: res.url || url };
}

function safePathname(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

function segmentRepresentationId(preferredVariantPath, mediaBase) {
  return preferredVariantPath || safePathname(mediaBase) || 'main';
}

function localSegmentPath(workDir, index, uri, fallbackExt) {
  return path.join(workDir, `seg_${String(index).padStart(5, '0')}.${extForUri(uri, fallbackExt)}`);
}

export async function prepareHlsSegmentDownloadToLocal({
  url,
  headers = {},
  signal,
  tmpDir,
  checkpoint,
  preferredVariantPath = '',
  onProgress,
  adaptive,
  onAdaptiveDecision,
  onCheckpoint,
} = {}) {
  const workDir = tmpDir || fs.mkdtempSync(path.join(os.tmpdir(), 'sg-hls-segments-'));
  const ownsTmpDir = !tmpDir;

  try {
    let mediaText;
    let mediaBase;

    const first = await fetchPlaylistText(url, headers);
    const info = parsePlaylistText(first.text, first.url || url);
    if (info.kind === 'master' && info.variants.length > 0) {
      const matched = preferredVariantPath
        ? info.variants.find((variant) => safePathname(new URL(variant.uri, info.baseUrl || first.url || url).toString()) === preferredVariantPath)
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

    const support = inspectHlsSegmentSupport(mediaText);
    if (!support.ok) return support;

    const parsed = parseSegmentPlaylist(mediaText);
    if (!parsed.segments.length) {
      return createUnsupportedResult('hls-no-segments', 'Playlist media nao contem segmentos.');
    }

    const emitCheckpoint = ({
      taskState = 'downloading',
      completedSegmentIds = [],
      segmentStatuses = new Map(),
      diagnostics = {},
    } = {}) => {
      const checkpoint = createSegmentCheckpoint({
        backend: 'hls-segments',
        manifestUrl: mediaBase,
        outputMode: 'single',
        taskState,
        segments: parsed.segments.map((segment, index) => {
          const segmentId = createSegmentTaskId({
            stream: 'video',
            representationId: segmentRepresentationId(preferredVariantPath, mediaBase),
            segmentIndex: index,
          });
          return {
            id: segmentId,
            stream: 'video',
            representationId: segmentRepresentationId(preferredVariantPath, mediaBase),
            index,
            url: new URL(segment.uri, mediaBase).toString(),
            status: segmentStatuses.get(segmentId) || 'pending',
          };
        }),
        completedSegmentIds,
        diagnostics,
      });
      onCheckpoint?.(checkpoint);
      return checkpoint;
    };

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

    const segMap = new Map();
    const completedSegmentIds = new Set();
    const segmentStatuses = new Map();
    const checkpointCompletedIds = new Set(
      Array.isArray(checkpoint?.completedSegmentIds)
        ? checkpoint.completedSegmentIds.map((value) => String(value || '')).filter(Boolean)
        : []
    );
    const queue = parsed.segments.map((segment, index) => ({
      index,
      url: new URL(segment.uri, mediaBase).toString(),
      uri: segment.uri,
      local: localSegmentPath(workDir, index, segment.uri, fallbackExt),
      segmentId: createSegmentTaskId({
        stream: 'video',
        representationId: segmentRepresentationId(preferredVariantPath, mediaBase),
        segmentIndex: index,
      }),
    }));
    const total = queue.length;
    let totalBytes = 0;
    let done = 0;
    let failed = 0;
    let cursor = 0;
    const pendingQueue = [];

    for (const item of queue) {
      if (checkpointCompletedIds.has(item.segmentId) && fs.existsSync(item.local)) {
        completedSegmentIds.add(item.segmentId);
        segmentStatuses.set(item.segmentId, 'completed');
        segMap.set(item.url, item.local);
        totalBytes += fs.statSync(item.local).size;
        done += 1;
        continue;
      }
      pendingQueue.push(item);
    }

    const adaptiveOptions = normalizeAdaptiveControllerOptions(adaptive);
    const controller =
      adaptiveOptions && total >= 2
        ? createAdaptiveController({
            ...adaptiveOptions,
            min: Math.min(adaptiveOptions.min, total),
            max: Math.min(adaptiveOptions.max, total),
            initial: Math.min(adaptiveOptions.initial, total),
          })
        : null;

    let desired = controller ? controller.getConcurrency() : Math.min(SEGMENT_WORKERS, pendingQueue.length || total);
    let nextWorkerId = 0;
    let running = 0;
    let windowBytes = 0;
    let windowErrors = 0;
    let windowLatencyMs = 0;
    let windowRequests = 0;
    let windowStart = Date.now();
    let adaptiveTimer = null;
    const workers = new Set();

    emitCheckpoint({
      taskState: 'downloading',
      completedSegmentIds: [],
      segmentStatuses,
      diagnostics: {
        segmentCount: parsed.segments.length,
        keyCount: parsed.keys.length,
        mapCount: parsed.maps.length,
        resumedSegmentCount: completedSegmentIds.size,
      },
    });

    const flushAdaptiveWindow = () => {
      if (!controller) return;
      const elapsed = Date.now() - windowStart;
      if (elapsed <= 0) return;
      const decision = controller.sample({
        bytes: windowBytes,
        elapsedMs: elapsed,
        errors: windowErrors,
        concurrency: running,
        latencyMs: windowLatencyMs,
        requests: windowRequests,
        schedulerLimits: {
          downloadLimit: total,
          hostLimit: total,
          globalLimit: null,
        },
      });
      windowBytes = 0;
      windowErrors = 0;
      windowLatencyMs = 0;
      windowRequests = 0;
      windowStart = Date.now();
      desired = controller.getConcurrency();
      onAdaptiveDecision?.(decision);
      onProgress?.({ done, total, totalBytes, failed, concurrency: desired, adaptiveDecision: decision });
      spawnAvailableWorkers();
    };

    const workerLoop = async (id) => {
      running++;
      try {
        while (!signal?.aborted && id < desired) {
          const current = pendingQueue[cursor++];
          if (!current) return;
          const local = current.local;
          segmentStatuses.set(current.segmentId, 'downloading');
          let ok = false;
          for (let attempt = 1; attempt <= SEGMENT_ATTEMPTS && !ok; attempt++) {
            const startedAt = Date.now();
            try {
              const r = await fetchBinary(current.url, headers, signal);
              fs.writeFileSync(local, r.data);
              totalBytes += r.data.length;
              segMap.set(current.url, local);
              completedSegmentIds.add(current.segmentId);
              segmentStatuses.set(current.segmentId, 'completed');
              windowBytes += r.data.length;
              windowLatencyMs += Date.now() - startedAt;
              windowRequests++;
              ok = true;
            } catch (err) {
              windowLatencyMs += Date.now() - startedAt;
              windowRequests++;
              windowErrors++;
              if (attempt >= SEGMENT_ATTEMPTS) {
                failed++;
                segmentStatuses.set(current.segmentId, 'pending');
              }
            }
          }
          done++;
          emitCheckpoint({
            taskState: done >= total && failed === 0 ? 'downloaded' : 'downloading',
            completedSegmentIds: [...completedSegmentIds],
            segmentStatuses,
            diagnostics: {
              segmentCount: parsed.segments.length,
              keyCount: parsed.keys.length,
              mapCount: parsed.maps.length,
              totalBytes,
              failed,
              resumedSegmentCount: completedSegmentIds.size,
            },
          });
          onProgress?.({ done, total, totalBytes, failed, concurrency: desired });
        }
      } finally {
        running--;
      }
    };

    const spawnWorker = () => {
      const id = nextWorkerId++;
      const p = workerLoop(id);
      const tracked = p.finally(() => workers.delete(tracked));
      workers.add(tracked);
    };

    const spawnAvailableWorkers = () => {
      const toSpawn = Math.max(0, desired - running);
      for (let i = 0; i < toSpawn && cursor < pendingQueue.length; i++) {
        spawnWorker();
      }
    };

    adaptiveTimer = controller
      ? setInterval(() => flushAdaptiveWindow(), Math.max(50, controller.config().windowMs || 1200))
      : null;
    adaptiveTimer?.unref?.();

    spawnAvailableWorkers();
    while (workers.size > 0) {
      await Promise.all([...workers]);
      spawnAvailableWorkers();
    }
    clearInterval(adaptiveTimer);
    flushAdaptiveWindow();

    if (signal?.aborted) {
      return { ok: false, code: 'CANCELLED', error: 'Operacao cancelada.' };
    }
    if (failed > 0) {
      return { ok: false, code: 'SEGMENT_RETRY_EXHAUSTED', error: 'Falha ao baixar um ou mais segmentos.', failed };
    }

    const localPlaylist = path.join(workDir, 'local.m3u8');
    fs.writeFileSync(localPlaylist, rewritePlaylist(mediaText, segMap, keyFiles, mapFiles, mediaBase), 'utf8');
    const extraArgs = parsed.keys.length > 0 || parsed.maps.length > 0 ? ['-allowed_extensions', 'ALL'] : [];
    return {
      ok: true,
      localPlaylist,
      extraArgs,
      totalBytes,
      tmpDir: workDir,
      checkpoint: emitCheckpoint({
        taskState: 'downloaded',
        completedSegmentIds: [...completedSegmentIds],
        segmentStatuses,
        diagnostics: {
          segmentCount: parsed.segments.length,
          keyCount: parsed.keys.length,
          mapCount: parsed.maps.length,
          totalBytes,
          resumedSegmentCount: completedSegmentIds.size,
        },
      }),
      diagnostics: {
        segmentCount: parsed.segments.length,
        keyCount: parsed.keys.length,
        mapCount: parsed.maps.length,
        resumedSegmentCount: completedSegmentIds.size,
        workDir,
        adaptive: controller ? { enabled: true, finalConcurrency: controller.getConcurrency() } : { enabled: false },
      },
      cleanup: ownsTmpDir ? () => fs.rmSync(workDir, { recursive: true, force: true }) : () => {},
    };
  } catch (err) {
    if (ownsTmpDir) {
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {
        /* ignora */
      }
    }
    return {
      ok: false,
      code: err?.code || 'HLS_SEGMENTS_FAILED',
      error: err?.message || 'Falha ao preparar HLS segmentado.',
      status: err?.status || 0,
      fallback: 'ffmpeg',
    };
  }
}

export default {
  inspectHlsSegmentSupport,
  prepareHlsSegmentDownloadToLocal,
};
