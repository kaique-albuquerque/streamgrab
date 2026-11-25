/**
 * Gerenciador de jobs de transcrição — wrapper de domínio sobre o núcleo
 * genérico de fila (`src/core/job-queue.js`).
 *
 * O núcleo cuida de concorrência, retry com backoff, cancelamento por jobId
 * (AbortSignal propagado ao runner), persistência em JSON e recuperação de
 * crash. Este módulo só fornece o que é de transcrição:
 *  - `makeTranscribeJob` → campos do job (`videoPath`, `language`, `formats`,
 *    `title`, `model`) e `jobId` no formato `tr_<base36>_<n>`;
 *  - `makeTranscribeRunner` → repassa `{ job }` para o runner de transcrição;
 *  - `snapshotJob` → snapshot serializável (mesmos campos de sempre).
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

import { createJobQueue, createJsonJobStorage, JOB_STATUS } from '../core/job-queue.js';
import { DEFAULT_MODEL, isKnownModel } from './model-manager.js';
import { defaultRunner } from './job-manager/constants.js';
import { snapshot } from './job-manager/storage.js';

export { createJsonJobStorage, JOB_STATUS };

/**
 * Cria o job de transcrição a partir dos params recebidos.
 *
 * Mantém exatamente os campos de antes da extração do núcleo, inclusive a
 * ordem, para que o snapshot e a persistência continuem idênticos.
 */
function makeTranscribeJob(ctx, { videoPath, language = 'pt', formats = ['txt', 'md'], title = '', model = DEFAULT_MODEL } = {}) {
  ctx.idCounter++;
  return {
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
}

/**
 * Cria o runner de transcrição: extrai os campos de `job` e monta a chamada
 * que o `transcribeVideo` espera.
 */
function makeTranscribeRunner(ctx) {
  return ({ job, signal, onProgress, onLog }) =>
    (ctx.runner || defaultRunner)({
      videoPath: job.videoPath,
      language: job.language,
      formats: job.formats,
      title: job.title || undefined,
      model: job.model || DEFAULT_MODEL,
      signal,
      onProgress,
      onLog,
    });
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
export function createTranscriptionJobManager(options = {}) {
  return createJobQueue({
    ...options,
    runner: options.runner || null,
    createJob: makeTranscribeJob,
    createRunner: makeTranscribeRunner,
    snapshotJob: snapshot,
  });
}

export default createTranscriptionJobManager;