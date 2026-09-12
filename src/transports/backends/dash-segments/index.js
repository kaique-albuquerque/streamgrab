/**
 * DASH segments — orchestrator and barrel re-export.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { fetchDashManifestText, parseDashManifest } from '../../../dash.js';
import { createAdaptiveController, normalizeAdaptiveControllerOptions } from '../../adaptive-controller.js';
import { inspectDashSegmentSupport, resolveAbsolute } from './helpers.js';
import { buildCheckpointIds, createCheckpointEmitter, restoreFromCheckpoint } from './checkpoint.js';
import { createWorkerLoop, createSpawnManager, flushAdaptiveWindow } from './worker.js';

export { inspectDashSegmentSupport } from './helpers.js';

export async function prepareDashSegmentDownloadToLocal({
  url, headers = {}, signal, tmpDir, checkpoint,
  onProgress, adaptive, onAdaptiveDecision, onCheckpoint,
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
    const total = audioRep ? 2 : 1;

    const { videoCheckpointId, audioCheckpointId } = buildCheckpointIds(videoRep, audioRep);
    const { emitCheckpoint, completedSegmentIds, representationStatuses } = createCheckpointEmitter({
      manifestUrl: manifest.url || url, videoRep, audioRep, manifestBase,
      videoCheckpointId, audioCheckpointId, onCheckpoint,
    });

    const queue = [
      { rep: videoRep, kind: 'video', checkpointId: videoCheckpointId },
      ...(audioRep ? [{ rep: audioRep, kind: 'audio', checkpointId: audioCheckpointId }] : []),
    ];

    const checkpointCompletedIds = new Set(
      Array.isArray(checkpoint?.completedSegmentIds)
        ? checkpoint.completedSegmentIds.map((v) => String(v || '')).filter(Boolean)
        : []
    );
    const { restored, pendingQueue, totalBytes: restoredBytes, done: restoredDone } =
      restoreFromCheckpoint(queue, checkpointCompletedIds, manifestBase, workDir);

    for (const item of queue) {
      if (restored.has(item.kind)) {
        completedSegmentIds.add(item.checkpointId);
        representationStatuses.set(item.checkpointId, 'completed');
      }
    }

    emitCheckpoint({ taskState: 'downloading', diagnostics: {
      videoRepresentationId: videoRep.id || '',
      audioRepresentationId: audioRep?.id || '',
    }});

    const adaptiveOptions = normalizeAdaptiveControllerOptions(adaptive);
    const controller = adaptiveOptions && queue.length >= 2
      ? createAdaptiveController({
          ...adaptiveOptions,
          min: Math.min(adaptiveOptions.min, queue.length),
          max: Math.min(adaptiveOptions.max, queue.length),
          initial: Math.min(adaptiveOptions.initial, queue.length),
        })
      : null;

    const state = {
      signal, manifestBase, headers, workDir, videoRep, audioRep,
      completedSegmentIds, representationStatuses, results: restored,
      pendingQueue, cursor: 0, running: 0, desired: 0,
      totalBytes: restoredBytes, done: restoredDone, total,
      queueLength: queue.length,
      windowBytes: 0, windowErrors: 0, windowLatencyMs: 0,
      windowRequests: 0, windowStart: Date.now(),
      emitCheckpoint, onProgress,
    };

    state.desired = controller ? controller.getConcurrency() : pendingQueue.length || queue.length;
    const workerLoop = createWorkerLoop(state);
    state.workerLoop = workerLoop;
    const { workers, spawnAvailable } = createSpawnManager(state);

    const adaptiveTimer = controller
      ? setInterval(() => flushAdaptiveWindow(state, controller, onAdaptiveDecision, onProgress),
          Math.max(50, controller.config().windowMs || 1200))
      : null;
    adaptiveTimer?.unref?.();

    spawnAvailable();
    while (workers.size > 0) {
      await Promise.all([...workers]);
      spawnAvailable();
    }
    clearInterval(adaptiveTimer);
    flushAdaptiveWindow(state, controller, onAdaptiveDecision, onProgress);

    const video = state.results.get('video');
    const audio = state.results.get('audio') || null;

    return {
      ok: true,
      mode: audio ? 'mux' : 'single',
      videoPath: video.localPath,
      audioPath: audio?.localPath || '',
      totalBytes: state.totalBytes,
      checkpoint: emitCheckpoint({ taskState: 'downloaded', diagnostics: {
        videoRepresentationId: videoRep.id || '',
        audioRepresentationId: audioRep?.id || '',
        totalBytes: state.totalBytes,
      }}),
      diagnostics: {
        videoRepresentationId: videoRep.id || '',
        audioRepresentationId: audioRep?.id || '',
        resumedSegmentCount: completedSegmentIds.size,
        workDir,
        adaptive: controller
          ? { enabled: true, finalConcurrency: controller.getConcurrency() }
          : { enabled: false },
      },
      cleanup: ownsTmpDir ? () => fs.rmSync(workDir, { recursive: true, force: true }) : () => {},
    };
  } catch (err) {
    if (ownsTmpDir) {
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ok */ }
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

export default { inspectDashSegmentSupport, prepareDashSegmentDownloadToLocal };
