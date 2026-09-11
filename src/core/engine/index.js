/**
 * P2.5 — DownloadEngine (ciclo de vida do job)
 *
 * Motor de execucao independente de CLI e Electron: recebe um job (ou URL),
 * conduz o ciclo de vida (queued -> analyzing -> preparing -> downloading ->
 * paused/merging -> completed/failed/cancelled) e emite os eventos da P2.3
 * (start/progress/speed/eta/pause/resume/complete/error/cancel) com payload
 * padronizado. A UI nunca parseia logs do FFmpeg: o progresso chega via
 * eventos deste engine.
 *
 * Este modulo e o ponto de entrada principal do engine.
 * As funcoes auxiliares estao em:
 *  - helpers.js   — funcoes puras (progresso, ETA, mascaramento, etc)
 *  - runners.js   — execucoes concretas de download (fetch, ffmpeg, curl, mux)
 *  - executor.js  — executor padrao + resolvedor de adapter
 */

import fs from 'node:fs';

import { createEventBus, createProgressPayload } from '../events.js';
import {
  createDownloadJob,
  setJobCheckpoint,
  setJobTaskState,
  transitionJob,
  serializeJob,
  isTerminalJobState,
} from '../models.js';
import { classifyError, CancelledError } from '../errors.js';
import { resolveSafeFilename, nextAvailableName } from '../filenames.js';
import { estimateMuxSpace } from '../disk.js';
import { getDefaultDownloadsDir, normalizeHeaders } from '../../utils.js';
import { defaultStatePath, clearState } from '../resume.js';
import { mergeRequestContext } from '../request-context.js';
import { embedSubtitles } from './runners.js';

import {
  FALLBACK_TITLE,
  resolveFreshVariant,
  maskDiagUrl,
  normalizePreparedDownload,
  headersFromRequestContext,
  isRefreshableFailure,
} from './helpers.js';

import { defaultResolveAdapter, createDefaultExecutor } from './executor.js';

/**
 * Motor de ciclo de vida de downloads.
 *
 * Opcoes:
 *  - events: event bus da P2.3 (default: novo)
 *  - executor: transporte injetavel (default: createDefaultExecutor())
 *  - progressThrottleMs: intervalo minimo entre eventos de progresso
 *  - resolveAdapter: deteccao de fonte (default: defaultResolveAdapter)
 */
export class DownloadEngine {
  constructor({ events = createEventBus(), executor = createDefaultExecutor(), progressThrottleMs = 80, resolveAdapter = defaultResolveAdapter, settings = null, disk = null, history = null, atomic = null } = {}) {
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
    return [...this._jobs.values()].filter((j) => !isTerminalJobState(j.state)).map(serializeJob);
  }

  getHistory() {
    return [...this._jobs.values()].filter((j) => isTerminalJobState(j.state)).map(serializeJob);
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

  async _runJob(job, { selectedUrl, destination, headers = {}, auth = {}, forceYouTube = false, mode, audioLanguage, allAudio, subtitleLanguages = [], embedSubs = false, turbo, turboChunks } = {}) {
    try {
      const analyzed = await this._analyze(job, { selectedUrl, headers, auth, forceYouTube });
      const { adapter, raw } = analyzed;
      const { prepared } = await this._prepare(job, adapter, raw, {
        selectedUrl: analyzed.selectedUrl,
        destination,
        headers,
        auth,
        audioLanguage,
        allAudio,
        subtitleLanguages,
        embedSubs,
      });
      const outputPath = this._resolveOutput(job, prepared, destination);
      job.meta.output = outputPath;
      await this._downloadLoop(job, adapter, prepared, { headers, mode, turbo, turboChunks });

      // P12: embed subtitles after successful download (non-yt-dlp sources)
      // subtitleLanguages and embedSubs come from opts (passed via queue → engine.run)
      if (subtitleLanguages.length > 0 && job.meta?.output) {
        const subtitleTracks = prepared?._analysis?.subtitleTracks || job._analysis?.subtitleTracks || [];
        if (subtitleTracks.length > 0) {
          this._emit('log', { jobId: job.id, message: `[subs] processando ${subtitleTracks.length} legenda(s) disponivel(is)` });
          const subResult = await embedSubtitles({
            videoPath: job.meta.output,
            subtitleTracks,
            selectedLanguages: subtitleLanguages,
            embedSubs,
            headers,
            signal: this._active.get(job.id)?.attempt?.signal,
            onLog: (message) => this._emit('log', { jobId: job.id, message }),
          });
          if (!subResult?.ok) {
            this._emit('log', { jobId: job.id, message: `[subs] aviso: ${subResult?.error || 'falha ao processar legendas'}` });
          }
        }
      }

      this._complete(job);
    } catch (err) {
      this._handleFailure(job, err);
    } finally {
      this._active.delete(job.id);
    }
  }

  // -- decomposicao de _runJob -----------------------------------------------

  async _analyze(job, { selectedUrl, headers, auth, forceYouTube }) {
    transitionJob(job, 'analyzing');
    this._emit('start', { jobId: job.id, stage: 'analyzing', message: `Analisando ${maskDiagUrl(job.url)}` });

    if (job.meta?.recovered) {
      this._emit('log', { jobId: job.id, message: '[recovery] Download recuperado apos crash — re-analisando com tokens frescos' });
    }

    const adapter = await this.resolveAdapter(job.url, { headers, auth, forceYouTube });
    if (adapter.id === 'unknown') {
      const err = new Error('Fonte nao suportada.');
      err.code = 'UNSUPPORTED_SOURCE';
      throw err;
    }
    job._sourceType = adapter.id;
    job.meta.sourceType = adapter.id;

    let raw;
    try {
      raw = await this.executor.analyze(adapter, { url: job.url, headers, auth });
    } catch (err) {
      if (this._active.get(job.id)?.attempt?.signal.aborted) throw new CancelledError('Analise cancelada.');
      throw err;
    }
    job.title = raw?.title || job.title;
    job._analysis = raw;

    if (selectedUrl && raw?.kind === 'master' && Array.isArray(raw.variants) && raw.variants.length > 0) {
      const fresh = resolveFreshVariant(selectedUrl, raw.variants, raw.baseUrl);
      if (fresh) {
        this._emit('log', {
          jobId: job.id,
          message: `[mdstrm] variante re-resolvida com tokens frescos: ${maskDiagUrl(fresh)} (era ${maskDiagUrl(selectedUrl)})`,
        });
        selectedUrl = fresh;
      }
    }

    return { adapter, raw, selectedUrl };
  }

  async _prepare(job, adapter, raw, { selectedUrl, destination, headers, auth, audioLanguage, allAudio, subtitleLanguages = [], embedSubs = false }) {
    transitionJob(job, 'preparing');
    this._emit('progress', { jobId: job.id, stage: 'preparing', message: 'Preparando download' });

    const preparedRaw = await this.executor.prepare(adapter, { url: job.url, analysis: raw, selectedUrl, headers, auth, audioLanguage, allAudio, subtitleLanguages, embedSubs });
    const prepared = normalizePreparedDownload(preparedRaw);
    if (this._isAborted(job)) throw new CancelledError('Download cancelado.');
    job._prepared = prepared;
    job._downloadPlan = prepared?._downloadPlan || null;
    job.meta.totalBytes = Number(prepared.totalBytes || 0);
    job.meta.durationMs = Number(prepared.durationMs || 0);

    const dir = destination || this.settings?.get?.('defaultDir') || getDefaultDownloadsDir();
    if (this.disk && job.meta.totalBytes > 0) {
      const extra = prepared.strategy === 'mux' ? Math.max(0, estimateMuxSpace(job.meta.totalBytes) - job.meta.totalBytes) : 0;
      await this.disk.check({ dir, requiredBytes: job.meta.totalBytes, extraBytes: extra });
    }

    return { prepared };
  }

  _resolveOutput(job, prepared, destination) {
    const dir = destination || this.settings?.get?.('defaultDir') || getDefaultDownloadsDir();
    const base = job.meta?.filename || job.title || FALLBACK_TITLE;
    const ext = this._extensionFor(prepared, job._sourceType || job.meta?.sourceType);
    let output = resolveSafeFilename(base, { dir, ext });
    output = nextAvailableName(output);
    return output;
  }

  async _downloadLoop(job, adapter, preparedInitial, { headers, mode, turbo, turboChunks }) {
    transitionJob(job, 'downloading');
    setJobTaskState(job, 'downloading');
    job._startedAt = Date.now();
    const onProgress = this._makeProgress(job);
    let prepared = preparedInitial;
    let refreshCount = 0;

    for (;;) {
      const effectiveContext = mergeRequestContext({}, prepared?._requestContext || {});
      const effectiveHeaders = {
        ...headersFromRequestContext(effectiveContext),
        ...normalizeHeaders(headers),
      };
      if (job._cancelRequested) throw new CancelledError('Download cancelado.');
      if (job.state === 'paused') {
        transitionJob(job, 'downloading');
        this._emit('resume', { jobId: job.id, stage: 'downloading', message: 'Retomando download' });
      }
      const attempt = new AbortController();
      this._active.set(job.id, { attempt, resume: null });

      const result = await this.executor.run({
        job,
        prepared,
        output: job.meta.output,
        headers: effectiveHeaders,
        mode,
        signal: attempt.signal,
        onProgress,
        atomic: this.atomic,
        onLog: (message) => this._emit('log', { jobId: job.id, message }),
        featureFlags: job.meta?.featureFlags || this.settings?.get?.('features') || {},
        turbo: Boolean(turbo),
        turboChunks,
      });

      if (result?.paused) {
        transitionJob(job, 'paused');
        this._emit('pause', { jobId: job.id, stage: 'paused', message: 'Download pausado' });
        await new Promise((resolve) => {
          const entry = this._active.get(job.id);
          if (entry) entry.resume = resolve;
        });
        continue;
      }
      if (result?.cancelled) throw new CancelledError('Download cancelado.');
      if (!result?.ok) {
        const err = new Error(result?.error || 'Falha no download.');
        err.code = result?.code || 'DOWNLOAD_FAILED';
        err.status = result?.status || 0;
        err.detail = result?.detail || '';
        if (
          typeof adapter?.refresh === 'function' &&
          prepared?._downloadPlan?.capabilities?.refreshAccess &&
          refreshCount < 1 &&
          isRefreshableFailure(err)
        ) {
          const refreshedPlan = await adapter.refresh({
            reason: err.code === 'FORBIDDEN_ERROR' ? 'expired-url' : 'session-refresh',
            statusCode: err.status || 0,
            currentPlan: prepared._downloadPlan,
            progress: { refreshCount },
            refreshAttempt: refreshCount + 1,
          });
          if (refreshedPlan) {
            prepared = normalizePreparedDownload(refreshedPlan);
            job._prepared = prepared;
            job._downloadPlan = prepared?._downloadPlan || null;
            job.meta.totalBytes = Number(prepared.totalBytes || job.meta.totalBytes || 0);
            job.meta.durationMs = Number(prepared.durationMs || job.meta.durationMs || 0);
            refreshCount += 1;
            this._emit('log', {
              jobId: job.id,
              message: `[refresh] plano renovado pelo provider ${adapter.id} (tentativa ${refreshCount})`,
            });
            continue;
          }
        }
        throw err;
      }
      break;
    }
  }

  _complete(job) {
    setJobTaskState(job, 'completed');
    transitionJob(job, 'completed');
    job._downloadedAt = Date.now();
    if (job.meta?.output) {
      clearState(defaultStatePath(job.meta.output)).catch(() => {});
    }
    this._recordHistory(job, { status: 'completed' });
    this._emit('complete', {
      jobId: job.id,
      stage: 'completed',
      percent: 100,
      message: `Download concluido: ${job.meta.output}`,
      output: job.meta.output || '',
    });
  }

  _handleFailure(job, err) {
    const classified = classifyError(err);
    if (classified instanceof CancelledError) {
      transitionJob(job, 'cancelled', { error: classified });
      this._cleanupPartial(job.meta.output);
      this._recordHistory(job, { status: 'cancelled' });
      this._emit('cancel', { jobId: job.id, stage: 'cancelled', message: 'Download cancelado.' });
      return;
    }
    transitionJob(job, 'failed', { error: classified });
    this._cleanupPartial(job.meta.output);
    this._recordHistory(job, { status: 'failed' });
    this._emit('error', {
      jobId: job.id,
      stage: 'failed',
      message: classified.friendlyMessage || classified.message,
      code: classified.code || '',
      suggestedAction: classified.suggestedAction || '',
      detail: classified.detail || '',
      status: classified.status || 0,
    });
    throw classified;
  }

  _recordHistory(job, { status }) {
    if (!this.history || typeof this.history.add !== 'function') return;
    try {
      let size = 0;
      const out = job.meta?.output;
      if (out && fs.existsSync(out)) {
        try { size = fs.statSync(out).size; } catch { size = 0; }
      }
      this.history.add({
        title: job.title || job.url,
        url: job.url,
        provider: job._sourceType || job.meta?.sourceType || '',
        format: job.meta?.format || job.meta?.chosenFormat || '',
        destination: job.meta?.output || '',
        status,
        size,
        durationMs: job._startedAt ? Math.max(0, Date.now() - job._startedAt) : 0,
      });
    } catch {
      /* historico nunca derruba o download */
    }
  }

  _isAborted(job) {
    return Boolean(this._active.get(job.id)?.attempt?.signal.aborted);
  }

  _extensionFor(prepared, sourceType) {
    if (prepared.strategy === 'mux' || prepared.strategy === 'mux-multi') return '.mp4';
    const st = String(sourceType || '').toLowerCase();
    if (st === 'hls' || st === 'dash') return '.mp4';
    const url = String(prepared.downloadUrl || prepared.url || '');
    try {
      const pathname = new URL(url).pathname || '';
      const m = pathname.match(/\.([A-Za-z0-9]{1,12})$/);
      return m ? `.${m[1].toLowerCase()}` : '.mp4';
    } catch {
      return '.mp4';
    }
  }

  _makeProgress(job) {
    let lastEmit = 0;
    return (update = {}) => {
      const now = Date.now();
      if (now - lastEmit < this.progressThrottleMs) return;
      lastEmit = now;
      const clean = {};
      for (const [k, v] of Object.entries(update)) {
        if (v !== undefined) clean[k] = v;
      }
      if (clean.stage === 'merging') {
        if (!job.meta.downloadedAt) job.meta.downloadedAt = new Date(now).toISOString();
        if (job.meta.taskState !== 'processing' && job.meta.taskState !== 'completed') {
          setJobTaskState(job, 'processing');
        }
      }
      const payload = createProgressPayload({ ...clean, jobId: job.id, stage: clean.stage || 'downloading' });
      this._emit('progress', payload);
      if (clean.speed != null) this._emit('speed', { jobId: job.id, speed: clean.speed });
      if (clean.etaSeconds != null) this._emit('eta', { jobId: job.id, etaSeconds: clean.etaSeconds });
    };
  }

  _cleanupPartial(output) {
    try {
      if (output && fs.existsSync(output)) fs.unlinkSync(output);
    } catch { /* ignora */ }
    if (output) clearState(defaultStatePath(output)).catch(() => {});
  }

  // -- controle -------------------------------------------------------------

  pause(id) {
    const job = this._jobs.get(String(id));
    if (!job) {
      const err = new Error(`Job nao encontrado: ${id}`);
      err.code = 'JOB_NOT_FOUND';
      throw err;
    }
    if (job.state === 'downloading') {
      this._active.get(job.id)?.attempt.abort('pause');
    }
    return serializeJob(job);
  }

  resume(id) {
    const job = this._jobs.get(String(id));
    if (!job) {
      const err = new Error(`Job nao encontrado: ${id}`);
      err.code = 'JOB_NOT_FOUND';
      throw err;
    }
    if (job.state === 'paused') {
      this._active.get(job.id)?.resume?.();
    }
    return serializeJob(job);
  }

  cancel(id) {
    const job = this._jobs.get(String(id));
    if (!job) {
      const err = new Error(`Job nao encontrado: ${id}`);
      err.code = 'JOB_NOT_FOUND';
      throw err;
    }
    if (isTerminalJobState(job.state)) return serializeJob(job);
    job._cancelRequested = true;
    const entry = this._active.get(job.id);
    if (job.state === 'queued') {
      transitionJob(job, 'cancelled', { error: new CancelledError('Download cancelado.') });
      this._emit('cancel', { jobId: job.id, stage: 'cancelled', message: 'Download cancelado.' });
    } else if (job.state === 'paused') {
      entry?.resume?.();
    } else {
      entry?.attempt.abort('cancel');
    }
    return serializeJob(job);
  }

  dispose() {
    for (const [, entry] of this._active) {
      entry.attempt.abort('cancel');
      entry.resume?.();
    }
    this._active.clear();
  }
}

/** Factory de conveniencia. */
export function createDownloadEngine(opts) {
  return new DownloadEngine(opts);
}

export default DownloadEngine;
