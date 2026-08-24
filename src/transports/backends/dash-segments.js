import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { fetchDashManifestText, parseDashManifest } from '../../dash.js';
import { createAdaptiveController, normalizeAdaptiveControllerOptions } from '../adaptive-controller.js';
import { createSegmentCheckpoint, createSegmentTaskId } from '../../core/models.js';

function createUnsupportedResult(reasonCode, reason) {
  return {
    ok: false,
    code: 'MANIFEST_UNSUPPORTED',
    reasonCode,
    error: reason,
    fallback: 'ffmpeg',
  };
}

function resolveAbsolute(url, baseUrl) {
  return new URL(url, baseUrl).toString();
}

export function inspectDashSegmentSupport(parsed) {
  if (!parsed || parsed.kind !== 'dash') {
    return createUnsupportedResult('not-dash', 'Manifesto nao parece ser DASH.');
  }
  if (String(parsed.type || '') !== 'static') {
    return createUnsupportedResult('dash-live-unsupported', 'Somente MPD static e suportado nesta fase.');
  }
  if (!Array.isArray(parsed.videoRepresentations) || parsed.videoRepresentations.length === 0) {
    return createUnsupportedResult('dash-no-video', 'Manifesto DASH sem representacao de video suportada.');
  }
  const unsupported = parsed.representations.find((rep) => !rep.baseUrl || !rep.segmentBase);
  if (unsupported) {
    return createUnsupportedResult('dash-template-unsupported', 'Somente MPD com BaseURL + SegmentBase e suportado nesta fase.');
  }
  return { ok: true };
}

async function fetchBinary(url, headers, signal) {
  const res = await fetch(url, { headers, redirect: 'follow', signal });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
}

async function downloadRepresentation(rep, baseUrl, headers, workDir, prefix, signal) {
  const absolute = resolveAbsolute(rep.baseUrl, baseUrl);
  const ext = path.extname(new URL(absolute).pathname) || '.mp4';
  const local = path.join(workDir, `${prefix}${ext}`);
  const data = await fetchBinary(absolute, headers, signal);
  fs.writeFileSync(local, data);
  return { localPath: local, bytes: data.length, absoluteUrl: absolute };
}

export async function prepareDashSegmentDownloadToLocal({
  url,
  headers = {},
  signal,
  tmpDir,
  checkpoint,
  onProgress,
  adaptive,
  onAdaptiveDecision,
  onCheckpoint,
} = {}) {
  const workDir = tmpDir || fs.mkdtempSync(path.join(os.tmpdir(), 'sg-dash-segments-'));
  const ownsTmpDir = !tmpDir;
  try {
    const manifest = await fetchDashManifestText(url, headers);
    const parsed = parseDashManifest(manifest.text, manifest.url || url);
    const support = inspectDashSegmentSupport(parsed);
    if (!support.ok) return support;

    const videoRep = parsed.videoRepresentations[0];
    const audioRep = parsed.audioRepresentations[0] || null;
    const manifestBase = parsed.baseUrl || manifest.url || url;
    const videoCheckpointId = createSegmentTaskId({
      stream: 'video',
      representationId: videoRep.id || 'video',
      segmentIndex: 0,
      init: true,
    });
    const audioCheckpointId = audioRep
      ? createSegmentTaskId({
          stream: 'audio',
          representationId: audioRep.id || 'audio',
          segmentIndex: 0,
          init: true,
        })
      : null;
    let totalBytes = 0;
    let done = 0;
    const total = audioRep ? 2 : 1;
    const queue = [{ rep: videoRep, kind: 'video', checkpointId: videoCheckpointId }, ...(audioRep ? [{ rep: audioRep, kind: 'audio', checkpointId: audioCheckpointId }] : [])];
    const adaptiveOptions = normalizeAdaptiveControllerOptions(adaptive);
    const controller =
      adaptiveOptions && queue.length >= 2
        ? createAdaptiveController({
            ...adaptiveOptions,
            min: Math.min(adaptiveOptions.min, queue.length),
            max: Math.min(adaptiveOptions.max, queue.length),
            initial: Math.min(adaptiveOptions.initial, queue.length),
          })
        : null;
    let desired = controller ? controller.getConcurrency() : queue.length;
    let cursor = 0;
    let running = 0;
    let windowBytes = 0;
    let windowErrors = 0;
    let windowLatencyMs = 0;
    let windowRequests = 0;
    let windowStart = Date.now();
    const workers = new Set();
    const results = new Map();
    const completedSegmentIds = new Set();
    const representationStatuses = new Map();
    const checkpointCompletedIds = new Set(
      Array.isArray(checkpoint?.completedSegmentIds)
        ? checkpoint.completedSegmentIds.map((value) => String(value || '')).filter(Boolean)
        : []
    );

    const emitCheckpoint = ({ taskState = 'downloading', diagnostics = {} } = {}) => {
      const segments = [
        {
          id: videoCheckpointId,
          stream: 'video',
          representationId: videoRep.id || 'video',
          index: 0,
          init: true,
          url: resolveAbsolute(videoRep.baseUrl, manifestBase),
          status: representationStatuses.get(videoCheckpointId) || 'pending',
        },
      ];
      if (audioRep) {
        segments.push({
          id: audioCheckpointId,
          stream: 'audio',
          representationId: audioRep.id || 'audio',
          index: 0,
          init: true,
          url: resolveAbsolute(audioRep.baseUrl, manifestBase),
          status: representationStatuses.get(audioCheckpointId) || 'pending',
        });
      }
      const checkpoint = createSegmentCheckpoint({
        backend: 'dash-segments',
        manifestUrl: manifest.url || url,
        outputMode: audioRep ? 'mux' : 'single',
        taskState,
        selected: {
          videoRepresentationId: videoRep.id || '',
          audioRepresentationId: audioRep?.id || '',
        },
        segments,
        completedSegmentIds: [...completedSegmentIds],
        diagnostics,
      });
      onCheckpoint?.(checkpoint);
      return checkpoint;
    };

    emitCheckpoint({
      taskState: 'downloading',
      diagnostics: {
        videoRepresentationId: videoRep.id || '',
        audioRepresentationId: audioRep?.id || '',
      },
    });

    const pendingQueue = [];
    for (const item of queue) {
      const absolute = resolveAbsolute(item.rep.baseUrl, manifestBase);
      const ext = path.extname(new URL(absolute).pathname) || '.mp4';
      const localPath = path.join(workDir, `${item.kind}${ext}`);
      item.localPath = localPath;
      if (checkpointCompletedIds.has(item.checkpointId) && fs.existsSync(localPath)) {
        const bytes = fs.statSync(localPath).size;
        results.set(item.kind, { localPath, bytes, absoluteUrl: absolute });
        completedSegmentIds.add(item.checkpointId);
        representationStatuses.set(item.checkpointId, 'completed');
        totalBytes += bytes;
        done += 1;
        continue;
      }
      pendingQueue.push(item);
    }

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
          downloadLimit: pendingQueue.length || queue.length,
          hostLimit: pendingQueue.length || queue.length,
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
      onProgress?.({ done, total, totalBytes, failed: 0, concurrency: desired, adaptiveDecision: decision });
      spawnAvailableWorkers();
    };

    const workerLoop = async (id) => {
      running++;
      try {
        while (!signal?.aborted && id < desired) {
          const current = pendingQueue[cursor++];
          if (!current) return;
          const startedAt = Date.now();
          const checkpointId = current.checkpointId;
          representationStatuses.set(checkpointId, 'downloading');
          try {
            const download = await downloadRepresentation(
              current.rep,
              manifestBase,
              headers,
              workDir,
              current.kind,
              signal
            );
            results.set(current.kind, download);
            totalBytes += download.bytes;
            completedSegmentIds.add(checkpointId);
            representationStatuses.set(checkpointId, 'completed');
            windowBytes += download.bytes;
            windowLatencyMs += Date.now() - startedAt;
            windowRequests++;
            done++;
            emitCheckpoint({
              taskState: done >= total ? 'downloaded' : 'downloading',
              diagnostics: {
                videoRepresentationId: videoRep.id || '',
                audioRepresentationId: audioRep?.id || '',
                totalBytes,
              },
            });
            onProgress?.({ done, total, totalBytes, failed: 0, queue: current.kind, concurrency: desired });
          } catch (err) {
            windowErrors++;
            windowLatencyMs += Date.now() - startedAt;
            windowRequests++;
            representationStatuses.set(checkpointId, 'pending');
            throw err;
          }
        }
      } finally {
        running--;
      }
    };

    const spawnWorker = () => {
      const id = workers.size;
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

    desired = controller ? controller.getConcurrency() : pendingQueue.length || queue.length;

    const adaptiveTimer = controller
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

    const video = results.get('video');
    const audio = results.get('audio') || null;

    return {
      ok: true,
      mode: audio ? 'mux' : 'single',
      videoPath: video.localPath,
      audioPath: audio?.localPath || '',
      totalBytes,
      checkpoint: emitCheckpoint({
        taskState: 'downloaded',
        diagnostics: {
          videoRepresentationId: videoRep.id || '',
          audioRepresentationId: audioRep?.id || '',
          totalBytes,
        },
      }),
      diagnostics: {
        videoRepresentationId: videoRep.id || '',
        audioRepresentationId: audioRep?.id || '',
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
      } catch {}
    }
    return {
      ok: false,
      code: err?.code || 'DASH_SEGMENTS_FAILED',
      error: err?.message || 'Falha ao preparar DASH segmentado.',
      status: err?.status || 0,
      fallback: 'ffmpeg',
    };
  }
}

export default {
  inspectDashSegmentSupport,
  prepareDashSegmentDownloadToLocal,
};
