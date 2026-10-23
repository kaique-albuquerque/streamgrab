/**
 * Pool de download das partes com redução dinâmica de concorrência.
 */

import { delay, MAX_CONCURRENCY_DOWNGRADES, PART_IDLE_WAIT_MS, PART_RETRY_BASE_DELAY_MS } from '../file-download-shared.js';
import { persistPartCompletion } from './manifest.js';
import { createPartPath } from './paths.js';
import { downloadPartWithRetry, isRetryablePartError } from './part-retry.js';

async function runWorker({ queue, workerIndex, state, ctx }) {
  const { partsDir, url, headers, io, manifestPath, manifest, onBytes } = ctx;

  while (!state.abort.signal.aborted) {
    if (workerIndex >= state.activeConcurrency) {
      await delay(PART_IDLE_WAIT_MS);
      continue;
    }
    const current = queue.shift();
    if (!current) break;
    const partPath = createPartPath(partsDir, current.index);

    try {
      await downloadPartWithRetry({
        url,
        headers,
        range: current,
        partPath,
        io,
        signal: state.abort.signal,
        onBytes: (bytes) => onBytes(bytes),
      });
      await persistPartCompletion(manifestPath, manifest, current);
    } catch (err) {
      const canDowngrade =
        !state.abort.signal.aborted &&
        isRetryablePartError(err) &&
        state.activeConcurrency > 1 &&
        state.downgradeCount < MAX_CONCURRENCY_DOWNGRADES;

      if (canDowngrade) {
        const nextConcurrency = Math.max(1, Math.floor(state.activeConcurrency / 2));
        if (nextConcurrency < state.activeConcurrency) {
          state.downgradeCount += 1;
          state.activeConcurrency = nextConcurrency;
          queue.unshift(current);
          io.log(
            `[turbo] Instabilidade detectada na parte ${current.index + 1}. Reduzindo concorrencia para ${state.activeConcurrency} e recolocando a parte na fila.`,
          );
          await delay(PART_RETRY_BASE_DELAY_MS * state.downgradeCount);
          continue;
        }
      }

      if (!state.failed) {
        state.failed = err;
        state.failedRange = current;
      }
      state.abort.abort();
      break;
    }
  }
}

/**
 * Executa as partes pendentes respeitando a concorrência inicial e
 * reduzindo-a quando erros de rede se repetem.
 *
 * @returns {Promise<{failed: Error|null, failedRange: object|null}>}
 */
export async function runPartWorkers({ pending, concurrency, ...ctx }) {
  const state = {
    abort: new AbortController(),
    activeConcurrency: Math.min(concurrency, pending.length || 1),
    downgradeCount: 0,
    failed: null,
    failedRange: null,
  };
  const queue = [...pending];
  const workerCount = Math.min(concurrency, pending.length || 1);

  const workers = Array.from(
    { length: workerCount },
    (_, workerIndex) => runWorker({ queue, workerIndex, state, ctx }),
  );
  await Promise.all(workers);

  return { failed: state.failed, failedRange: state.failedRange };
}
