/**
 * Gerenciador de jobs de transcrição — fila com limite de concorrência.
 *
 * O whisper small usa ~2 GB de RAM por execução; sem limite, vários vídeos
 * simultâneos derrubam a máquina. Este módulo mantém uma fila FIFO com:
 *  - concorrência configurável (padrão 1 job por vez)
 *  - retry automático com backoff progressivo
 *  - cancelamento por jobId (AbortSignal propagado ao runner)
 *  - persistência em JSON (crash recovery: jobs 'running' voltam como 'queued')
 *  - eventos: added, started, progress, log, done, error, cancelled, retry-scheduled
 *
 * O runner é injetável (padrão: transcribeVideo de ./index.js) — o módulo
 * permanece puro e testável sem binários de whisper.
 *
 * Uso:
 *   const manager = createTranscriptionJobManager({ storage, onEvent });
 *   manager.load();
 *   const job = manager.enqueue({ videoPath, language: 'pt', formats: ['txt'] });
 *   manager.cancel(job.jobId);
 */
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_MODEL, isKnownModel } from './model-manager.js';

export const JOB_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  DONE: 'done',
  ERROR: 'error',
  CANCELLED: 'cancelled',
};

/** Runner padrão: transcribeVideo (import dinâmico para testabilidade). */
async function defaultRunner(params) {
  const { transcribeVideo } = await import('./index.js');
  return transcribeVideo(params);
}

/**
 * Storage JSON em arquivo (atomic write: temp + rename).
 *
 * @param {{ file: string }} params
 */
export function createJsonJobStorage({ file }) {
  return {
    load() {
      try {
        if (!fs.existsSync(file)) return [];
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        return Array.isArray(raw) ? raw : [];
      } catch {
        return [];
      }
    },
    save(jobs) {
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(jobs, null, 2), 'utf8');
        fs.renameSync(tmp, file);
      } catch {
        /* persistência nunca derruba o fluxo */
      }
    },
  };
}

/** Snapshot serializável de um job (sem refs de runtime). */
function snapshot(job) {
  return {
    jobId: job.jobId,
    videoPath: job.videoPath,
    language: job.language,
    formats: job.formats,
    title: job.title,
    model: job.model,
    status: job.status,
    attempts: job.attempts,
    stage: job.stage,
    percent: job.percent,
    error: job.error,
    files: job.files,
    engine: job.engine,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    nextRetryAt: job.nextRetryAt,
  };
}

/**
 * Cria o gerenciador de jobs de transcrição.
 *
 * @param {object} [options]
 * @param {number} [options.maxConcurrent=1] - Jobs simultâneos máximo
 * @param {number} [options.maxRetries=2] - Retries por job (além da 1ª tentativa)
 * @param {number} [options.retryDelayMs=5000] - Backoff base entre retries
 * @param {{ load(): object[], save(jobs: object[]): void } | null} [options.storage]
 * @param {Function} [options.runner] - Runner injetável (padrão: transcribeVideo)
 * @param {Function} [options.onEvent] - Callback (event, payload)
 * @param {() => number} [options.now] - Relógio injetável (testes)
 */
export function createTranscriptionJobManager({
  maxConcurrent = 1,
  maxRetries = 2,
  retryDelayMs = 5_000,
  storage = null,
  runner = null,
  onEvent = null,
  now = Date.now,
} = {}) {
  const ctx = {
    jobs: new Map(), // jobId → job
    order: [], // FIFO de jobIds 'queued'
    controllers: new Map(), // jobId → AbortController
    retryTimers: new Map(), // jobId → timer de retry
    concurrent: Math.max(1, Number(maxConcurrent) || 1),
    maxRetries,
    retryDelayMs,
    storage,
    runner,
    now,
    running: 0,
    idCounter: 0,

    emit(event, payload) {
      try {
        onEvent?.(event, payload);
      } catch {
        /* listener nunca derruba o fluxo */
      }
    },

    persist() {
      if (!storage?.save) return;
      storage.save([...ctx.jobs.values()].map(snapshot));
    },
  };

  return createManagerApi(ctx);
}

/** Executa um job (runner + retry/cancel) e bombeia a fila ao finalizar. */
async function startJob(ctx, job) {
  ctx.running++;
  job.status = JOB_STATUS.RUNNING;
  job.startedAt = ctx.now();
  job.finishedAt = null;
  job.attempts++;
  job.stage = 'preparing';
  job.percent = 0;
  job.error = null;
  job.nextRetryAt = null;

  const controller = new AbortController();
  ctx.controllers.set(job.jobId, controller);

  ctx.emit('started', snapshot(job));
  ctx.persist();

  const activeRunner = ctx.runner || defaultRunner;
  try {
    const result = await activeRunner({
      videoPath: job.videoPath,
      language: job.language,
      formats: job.formats,
      title: job.title || undefined,
      model: job.model || DEFAULT_MODEL,
      signal: controller.signal,
      onProgress: (progress) => {
        job.stage = progress.stage || job.stage;
        if (typeof progress.percent === 'number') job.percent = progress.percent;
        ctx.emit('progress', { jobId: job.jobId, ...progress });
      },
      onLog: (line) => ctx.emit('log', { jobId: job.jobId, line }),
    });

    job.status = JOB_STATUS.DONE;
    job.stage = 'done';
    job.percent = 100;
    job.finishedAt = ctx.now();
    job.files = result?.files || [];
    job.engine = result?.engine || '';
    ctx.emit('done', snapshot(job));
  } catch (err) {
    const cancelled = controller.signal.aborted;
    if (cancelled) {
      job.status = JOB_STATUS.CANCELLED;
      job.finishedAt = ctx.now();
      job.error = 'Cancelado pelo usuário.';
      ctx.emit('cancelled', snapshot(job));
    } else if (job.attempts <= ctx.maxRetries) {
      // Retry com backoff progressivo (5s, 10s, ...).
      const delay = ctx.retryDelayMs * job.attempts;
      job.status = JOB_STATUS.QUEUED;
      job.nextRetryAt = ctx.now() + delay;
      ctx.emit('retry-scheduled', snapshot(job));
      const timer = setTimeout(() => {
        ctx.retryTimers.delete(job.jobId);
        ctx.order.push(job.jobId);
        pump(ctx);
      }, delay);
      timer.unref?.();
      ctx.retryTimers.set(job.jobId, timer);
    } else {
      job.status = JOB_STATUS.ERROR;
      job.finishedAt = ctx.now();
      job.error = err?.message || String(err);
      ctx.emit('error', snapshot(job));
    }
  } finally {
    ctx.running--;
    ctx.controllers.delete(job.jobId);
    ctx.persist();
    pump(ctx);
  }
}

/** Bombeia a fila: inicia jobs 'queued' enquanto houver vaga. */
function pump(ctx) {
  while (ctx.running < ctx.concurrent) {
    const jobId = ctx.order.shift();
    if (!jobId) break;
    const job = ctx.jobs.get(jobId);
    if (!job || job.status !== JOB_STATUS.QUEUED) continue;
    startJob(ctx, job);
  }
}

/** API pública do gerenciador. */
function createManagerApi(ctx) {
  return {
    /** Enfileira um job. Validação de entrada é responsabilidade do chamador. */
    enqueue({ videoPath, language = 'pt', formats = ['txt', 'md'], title = '', model = DEFAULT_MODEL } = {}) {
      ctx.idCounter++;
      const job = {
        jobId: `tr_${ctx.now().toString(36)}_${ctx.idCounter}`,
        videoPath,
        language,
        formats,
        title,
        // Ids desconhecidos caem no padrão: jobs antigos (sem `model`)
        // continuam retomáveis após crash recovery.
        model: isKnownModel(model) ? model : DEFAULT_MODEL,
        status: JOB_STATUS.QUEUED,
        attempts: 0,
        stage: 'queued',
        percent: 0,
        error: null,
        files: [],
        engine: '',
        createdAt: ctx.now(),
        startedAt: null,
        finishedAt: null,
        nextRetryAt: null,
      };
      ctx.jobs.set(job.jobId, job);
      ctx.order.push(job.jobId);
      ctx.emit('added', snapshot(job));
      ctx.persist();
      // Snapshot antes do pump: caller recebe o job como 'queued'.
      const queued = snapshot(job);
      pump(ctx);
      return queued;
    },

    /** Cancela um job (running → abort; queued → remove da fila). */
    cancel(jobId) {
      const job = ctx.jobs.get(jobId);
      if (!job) return false;

      if (job.status === JOB_STATUS.RUNNING) {
        ctx.controllers.get(jobId)?.abort();
        return true;
      }

      const retryTimer = ctx.retryTimers.get(jobId);
      if (retryTimer) {
        clearTimeout(retryTimer);
        ctx.retryTimers.delete(jobId);
      }

      if (job.status === JOB_STATUS.QUEUED) {
        const idx = ctx.order.indexOf(jobId);
        if (idx >= 0) ctx.order.splice(idx, 1);
        job.status = JOB_STATUS.CANCELLED;
        job.finishedAt = ctx.now();
        job.error = 'Cancelado pelo usuário.';
        ctx.emit('cancelled', snapshot(job));
        ctx.persist();
        return true;
      }

      return false;
    },

    /** Re-enfileira um job cancelado ou com erro. */
    retry(jobId) {
      const job = ctx.jobs.get(jobId);
      if (!job || ![JOB_STATUS.ERROR, JOB_STATUS.CANCELLED].includes(job.status)) return false;

      const retryTimer = ctx.retryTimers.get(jobId);
      if (retryTimer) {
        clearTimeout(retryTimer);
        ctx.retryTimers.delete(jobId);
      }

      job.status = JOB_STATUS.QUEUED;
      job.error = null;
      job.nextRetryAt = null;
      ctx.order.push(jobId);
      ctx.emit('added', snapshot(job));
      ctx.persist();
      pump(ctx);
      return true;
    },

    /**
     * Remove um job terminal (done/error/cancelled) da lista e da
     * persistência. Jobs em execução não podem ser removidos (cancele antes).
     */
    remove(jobId) {
      const job = ctx.jobs.get(jobId);
      if (!job || job.status === JOB_STATUS.RUNNING) return false;

      const idx = ctx.order.indexOf(jobId);
      if (idx >= 0) ctx.order.splice(idx, 1);

      const retryTimer = ctx.retryTimers.get(jobId);
      if (retryTimer) {
        clearTimeout(retryTimer);
        ctx.retryTimers.delete(jobId);
      }

      ctx.jobs.delete(jobId);
      ctx.emit('removed', snapshot(job));
      ctx.persist();
      return true;
    },

    /** Lista snapshots de todos os jobs da sessão. */
    list() {
      return [...ctx.jobs.values()].map(snapshot);
    },

    /** Aplica novo limite de concorrência em tempo de execução. */
    setMaxConcurrent(n) {
      const value = Number(n);
      if (Number.isFinite(value) && value >= 1) {
        ctx.concurrent = Math.floor(value);
        pump(ctx);
      }
      return ctx.concurrent;
    },

    /**
     * Carrega jobs persistidos. Jobs 'running' (crash recovery) voltam
     * como 'queued' e são reprocessados.
     */
    load() {
      if (!ctx.storage?.load) return [];
      const restored = [];
      for (const data of ctx.storage.load()) {
        if (!data?.jobId || ctx.jobs.has(data.jobId)) continue;
        const status = data.status === JOB_STATUS.RUNNING ? JOB_STATUS.QUEUED : data.status;
        if (![JOB_STATUS.QUEUED, JOB_STATUS.ERROR, JOB_STATUS.CANCELLED, JOB_STATUS.DONE].includes(status)) {
          continue;
        }
        const job = {
          ...data,
          status,
          stage: status === JOB_STATUS.QUEUED ? 'queued' : data.stage,
          error: status === JOB_STATUS.QUEUED ? null : data.error,
          nextRetryAt: null,
        };
        ctx.jobs.set(job.jobId, job);
        if (status === JOB_STATUS.QUEUED) ctx.order.push(job.jobId);
        restored.push(snapshot(job));
      }
      if (restored.length) {
        ctx.persist();
        pump(ctx);
      }
      return restored;
    },

    /** Limpa timers e aborta jobs em execução. */
    dispose() {
      for (const timer of ctx.retryTimers.values()) clearTimeout(timer);
      ctx.retryTimers.clear();
      for (const controller of ctx.controllers.values()) controller.abort();
      ctx.controllers.clear();
    },
  };
}

export default createTranscriptionJobManager;
