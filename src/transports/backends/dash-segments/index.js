/**
 * DASH segments — orquestrador e barrel re-export.
 *
 * A montagem do estado/resultado esta em ./result.js; aqui fica apenas o
 * fluxo: buscar MPD, montar fila, baixar com workers e devolver o payload.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { fetchDashManifestText, parseDashManifest } from '../../../dash.js';
import { normalizeAdaptiveControllerOptions } from '../../adaptive-controller.js';
import { inspectDashSegmentSupport } from './helpers.js';
import { buildCheckpointIds, createCheckpointEmitter, restoreFromCheckpoint } from './checkpoint.js';
import { createWorkerLoop, createSpawnManager, flushAdaptiveWindow } from './worker.js';
import {
  buildQueue, completedIdsFrom, createAdaptive, resolveTrackPaths,
  buildSuccessResult, buildFailureResult,
} from './result.js';

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

    const { videoCheckpointId, audioCheckpointId } = buildCheckpointIds(videoRep, audioRep);
    const { emitCheckpoint, completedSegmentIds, representationStatuses } = createCheckpointEmitter({
      manifestUrl: manifest.url || url, videoRep, audioRep, manifestBase,
      videoCheckpointId, audioCheckpointId, onCheckpoint,
    });

    const queue = buildQueue(videoRep, audioRep, videoCheckpointId, audioCheckpointId);
    const { restored, pendingQueue, totalBytes: restoredBytes, done: restoredDone } =
      restoreFromCheckpoint(queue, completedIdsFrom(checkpoint), manifestBase, workDir);

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

    const controller = createAdaptive(normalizeAdaptiveControllerOptions(adaptive), queue.length);
    const state = {
      signal, manifestBase, headers, workDir, videoRep, audioRep,
      totalSeconds: parsed.durationSeconds || 0,
      completedSegmentIds, representationStatuses, results: restored,
      pendingQueue, cursor: 0, running: 0, desired: 0,
      totalBytes: restoredBytes, done: restoredDone, total: audioRep ? 2 : 1,
      queueLength: queue.length,
      windowBytes: 0, windowErrors: 0, windowLatencyMs: 0,
      windowRequests: 0, windowStart: Date.now(),
      emitCheckpoint, onProgress,
    };

    state.desired = controller ? controller.getConcurrency() : pendingQueue.length || queue.length;
    state.workerLoop = createWorkerLoop(state);
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

    return buildSuccessResult({
      state, videoRep, audioRep, workDir, ownsTmpDir, controller, emitCheckpoint,
      paths: resolveTrackPaths(state.results),
    });
  } catch (err) {
    return buildFailureResult(err, workDir, ownsTmpDir);
  }
}

export default { inspectDashSegmentSupport, prepareDashSegmentDownloadToLocal };