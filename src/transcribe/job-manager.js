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
 *
 * Modulos internos (src/transcribe/job-manager/):
 *  - constants.js → JOB_STATUS e runner padrão
 *  - storage.js   → persistência JSON e snapshot
 *  - engine.js    → execução de jobs e bombeamento da fila
 *  - actions.js   → enqueue / cancel / retry / remove
 *  - recovery.js  → crash recovery e dispose
 *  - api.js       → fachada pública
 */

import { createManagerApi } from './job-manager/api.js';
import { snapshot } from './job-manager/storage.js';

export { JOB_STATUS } from './job-manager/constants.js';
export { createJsonJobStorage } from './job-manager/storage.js';

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
      storage.save([...ctx.jobs.values()].map((job) => snapshot(job)));
    },
  };

  return createManagerApi(ctx);
}

export default createTranscriptionJobManager;
