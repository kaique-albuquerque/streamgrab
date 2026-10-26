/**
 * P2.5 — DownloadEngine (ciclo de vida do job)
 *
 * Motor de execucao independente de CLI e Electron: recebe um job (ou URL),
 * conduz o ciclo de vida (queued -> analyzing -> preparing -> downloading ->
 * paused/merging -> completed/failed/cancelled) e emite os eventos da P2.3.
 *
 * Modulos auxiliares:
 *  - helpers.js    — funcoes puras (progresso, ETA, mascaramento, etc)
 *  - job/          — registro de jobs (registry.js) e execucao (runner.js)
 *  - runners/      — execucoes concretas de download (fetch, ffmpeg, curl, mux)
 *  - executor.js   — executor padrao + resolvedor de adapter
 *  - lifecycle.js  — pipeline de execucao (analyze, prepare, downloadLoop)
 *  - completion.js — tratamento de estado terminal (complete, fail, history)
 *  - control.js    — pause/resume/cancel/dispose + helpers de progresso
 */

import { createEventBus, createProgressPayload } from '../events.js';
import {
  pause as _pause,
  resume as _resume,
  cancel as _cancel,
  dispose as _dispose,
  isAborted as _isAborted,
  makeProgress as _makeProgress,
} from './control.js';
import { defaultResolveAdapter, createDefaultExecutor } from './executor/index.js';
import {
  nextJobId, getJob, getQueue, getHistory, removeJob, enqueueJob,
} from './job/registry.js';
import { runTarget, runJob } from './job/runner.js';

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

  _nextId() { return nextJobId(); }
  getJob(id) { return getJob(this, id); }
  getQueue() { return getQueue(this); }
  getHistory() { return getHistory(this); }
  remove(id) { return removeJob(this, id); }
  enqueue(url, opts) { return enqueueJob(this, url, opts); }

  // -- execucao -------------------------------------------------------------

  async run(target, opts = {}) { return runTarget(this, target, opts); }
  async _runJob(job, opts = {}) { return runJob(this, job, opts); }

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
