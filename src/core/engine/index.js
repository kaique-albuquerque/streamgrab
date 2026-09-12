/**
 * P2.5 — DownloadEngine (ciclo de vida do job)
 *
 * Motor de execucao independente de CLI e Electron: recebe um job (ou URL),
 * conduz o ciclo de vida (queued -> analyzing -> preparing -> downloading ->
 * paused/merging -> completed/failed/cancelled) e emite os eventos da P2.3.
 *
 * Modulos auxiliares:
 *  - helpers.js    — funcoes puras (progresso, ETA, mascaramento, etc)
 *  - runners/      — execucoes concretas de download (fetch, ffmpeg, curl, mux)
 *  - executor.js   — executor padrao + resolvedor de adapter
 *  - lifecycle.js  — pipeline de execucao (analyze, prepare, downloadLoop)
 *  - completion.js — tratamento de estado terminal (complete, fail, history)
 *  - control.js    — pause/resume/cancel/dispose + helpers de progresso
 */

import { createEventBus, createProgressPayload } from '../events.js';
import {
  createDownloadJob,
  serializeJob,
  isTerminalJobState,
} from '../models/index.js';
import {
  analyze as _analyze,
  prepare as _prepare,
  resolveOutput as _resolveOutput,
  downloadLoop as _downloadLoop,
  processSubtitles,
} from './lifecycle.js';
import {
  complete as _complete,
  handleFailure as _handleFailure,
} from './completion.js';
import {
  pause as _pause,
  resume as _resume,
  cancel as _cancel,
  dispose as _dispose,
  isAborted as _isAborted,
  makeProgress as _makeProgress,
} from './control.js';

import { defaultResolveAdapter, createDefaultExecutor } from './executor.js';

/**
 * Motor de ciclo de vida de downloads.
 */
export class DownloadEngine {
  constructor({
    events = createEventBus(),
    executor = createDefaultExecutor(),
    progressThrottleMs = 80,
    resolveAdapter = defaultResolveAdapter,
    settings = null,
    disk = null,
    history = null,
    atomic = null,
  } = {}) {
    this.events = events;
    this.executor = executor;
    this.progressThrottleMs = progressThrottleMs;
    this.resolveAdapter = resolveAdapter;
    this.settings = settings;
    this.disk = disk;
    this.history = history;
    this.atomic = atomic;
    this._jobs = new Map();
    this._active = new Map();
  }

  // -- eventos --------------------------------------------------------------

  on(name, handler) { return this.events.on(name, handler); }
  once(name, handler) { return this.events.once(name, handler); }
  off(name, handler) { return this.events.off(name, handler); }

  _emit(name, payload) {
    this.events.emit(name, createProgressPayload(payload));
  }

  // -- fila -----------------------------------------------------------------

  _nextId() {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `job-${ts}-${rand}`;
  }

  getJob(id) {
    const job = this._jobs.get(String(id));
    return job ? serializeJob(job) : null;
  }

  getQueue() {
    return [...this._jobs.values()]
      .filter((j) => !isTerminalJobState(j.state)).map(serializeJob);
  }

  getHistory() {
    return [...this._jobs.values()]
      .filter((j) => isTerminalJobState(j.state)).map(serializeJob);
  }

  remove(id) {
    const job = this._jobs.get(String(id));
    if (!job) {
      const err = new Error(`Job nao encontrado: ${id}`);
      err.code = 'JOB_NOT_FOUND';
      throw err;
    }
    if (!isTerminalJobState(job.state)) {
      const err = new Error(`Job ${id} ainda nao terminou (${job.state}).`);
      err.code = 'JOB_ACTIVE';
      throw err;
    }
    this._jobs.delete(job.id);
    return true;
  }

  enqueue(url, { id, title = '', meta = {} } = {}) {
    const job = createDownloadJob({ id: id || this._nextId(), url, title, meta });
    this._jobs.set(job.id, job);
    return serializeJob(job);
  }

  // -- execucao -------------------------------------------------------------

  async run(target, opts = {}) {
    let job;
    const existing = typeof target === 'string' ? this._jobs.get(target) : null;
    if (existing) {
      if (isTerminalJobState(existing.state)) {
        const err = new Error(`Job ${existing.id} ja finalizado (${existing.state}).`);
        err.code = 'JOB_ALREADY_FINAL';
        throw err;
      }
      if (existing.state !== 'queued') {
        const err = new Error(`Job ${existing.id} ja esta em andamento (${existing.state}).`);
        err.code = 'JOB_ALREADY_RUNNING';
        throw err;
      }
      job = existing;
    } else {
      job = createDownloadJob({ id: this._nextId(), url: target, title: opts.title, meta: opts.meta });
      this._jobs.set(job.id, job);
    }
    await this._runJob(job, opts);
    return serializeJob(job);
  }

  async _runJob(job, {
    selectedUrl, destination, headers = {}, auth = {},
    forceYouTube = false, mode, audioLanguage, allAudio,
    subtitleLanguages = [], embedSubs = false, turbo, turboChunks,
  } = {}) {
    try {
      const analyzed = await _analyze(this, job, { selectedUrl, headers, auth, forceYouTube });
      const { adapter, raw } = analyzed;
      const { prepared } = await _prepare(this, job, adapter, raw, {
        selectedUrl: analyzed.selectedUrl, destination, headers, auth,
        audioLanguage, allAudio, subtitleLanguages, embedSubs,
      });
      const outputPath = _resolveOutput(this, job, prepared, destination);
      job.meta.output = outputPath;
      await _downloadLoop(this, job, adapter, prepared, { headers, mode, turbo, turboChunks });
      await processSubtitles(this, job, prepared, { subtitleLanguages, embedSubs, headers });
      _complete(this, job);
    } catch (err) {
      _handleFailure(this, job, err);
    } finally {
      this._active.delete(job.id);
    }
  }

  // -- helpers delegados ----------------------------------------------------

  _isAborted(job) { return _isAborted(this, job); }
  _makeProgress(job) { return _makeProgress(this, job); }

  // -- controle -------------------------------------------------------------

  pause(id) { return _pause(this, id); }
  resume(id) { return _resume(this, id); }
  cancel(id) { return _cancel(this, id); }
  dispose() { _dispose(this); }
}

/** Factory de conveniencia. */
export function createDownloadEngine(opts) {
  return new DownloadEngine(opts);
}

export default DownloadEngine;
