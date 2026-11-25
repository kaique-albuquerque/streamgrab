/**
 * Gerenciador de jobs de tradução — wrapper de domínio sobre o núcleo
 * genérico de fila (`src/core/job-queue.js`).
 *
 * O núcleo cuida de concorrência, retry, cancelamento, persistência e
 * recuperação de crash. Este módulo fornece o que é de tradução: campos do job
 * (`srtPath`, `targetLang`, `model`), `jobId` no formato `tl_<base36>_<n>` e o
 * runner que chama `translateSubtitle`.
 */

import { createJobQueue, createJsonJobStorage, JOB_STATUS } from '../core/job-queue.js';
import { DEFAULT_TRANSLATE_MODEL, isKnownTranslateModel } from './model-manager.js';

/** Alvo de leitura padrão (caracteres por segundo). */
export const DEFAULT_CHARS_PER_SECOND = 17;

export { createJsonJobStorage, JOB_STATUS };

/** Cria o job de tradução a partir dos params recebidos. */
function makeTranslateJob(ctx, { srtPath, targetLang = 'pt', model = DEFAULT_TRANSLATE_MODEL, charsPerSecond = DEFAULT_CHARS_PER_SECOND } = {}) {
  ctx.idCounter++;
  return {
    jobId: `tl_${ctx.now().toString(36)}_${ctx.idCounter}`,
    srtPath,
    targetLang,
    model: isKnownTranslateModel(model) ? model : DEFAULT_TRANSLATE_MODEL,
    charsPerSecond: Number.isFinite(charsPerSecond) ? charsPerSecond : DEFAULT_CHARS_PER_SECOND,
    status: JOB_STATUS.QUEUED,
    attempts: 0,
    stage: 'queued',
    percent: 0,
    error: null,
    files: [],
    overTarget: [],
    createdAt: ctx.now(),
    startedAt: null,
    finishedAt: null,
    nextRetryAt: null,
  };
}

/**
 * Runner padrão: chama `translateSubtitle` e converte o resultado no formato
 * que o núcleo espera (`{ files, engine }`).
 */
export async function defaultTranslateRunner({ srtPath, targetLang, model, charsPerSecond, signal, onProgress, onLog }) {
  const { translateSubtitle } = await import('./index.js');
  const result = await translateSubtitle({ srtPath, targetLang, model, charsPerSecond, signal, onProgress, onLog });
  return {
    files: [{ path: result.outputPath, format: 'srt', size: 0 }],
    engine: 'llama-cpp',
    overTarget: result.overTarget,
  };
}

/** Cria o runner de tradução (lê `ctx.runner` para permitir injeção em testes). */
function makeTranslateRunner(ctx) {
  return (params) => (ctx.runner || defaultTranslateRunner)(params);
}

/**
 * Cria o gerenciador de jobs de tradução.
 *
 * @param {object} [options]
 * @param {number} [options.maxConcurrent=1]
 * @param {number} [options.maxRetries=2]
 * @param {number} [options.retryDelayMs=5000]
 * @param {{ load(): object[], save(jobs: object[]): void } | null} [options.storage]
 * @param {Function} [options.runner] - Runner injetável (padrão: defaultTranslateRunner)
 * @param {Function} [options.onEvent]
 * @param {() => number} [options.now]
 */
export function createTranslateJobManager(options = {}) {
  return createJobQueue({
    ...options,
    runner: options.runner || null,
    createJob: makeTranslateJob,
    createRunner: makeTranslateRunner,
    snapshotJob: (job) => ({ ...job }),
  });
}

export default createTranslateJobManager;