/**
 * Espera o modelo GGUF ficar disponível antes de traduzir.
 *
 * O download do modelo (2,4 GB) pode levar minutos. Sem esta espera, um job
 * enfileirado durante o download falhava 3x com "modelo não baixado" e o
 * usuário tinha que repetir manualmente depois.
 */

/** Intervalo padrão entre verificações. */
const DEFAULT_WAIT_MS = 2000;

/** Espera máxima padrão (10 min — cobre o download do 4B em conexão lenta). */
const DEFAULT_MAX_WAIT_MS = 10 * 60 * 1000;

/**
 * Espera o modelo ficar instalado.
 *
 * @param {object} params
 * @param {string} params.model - Id do modelo
 * @param {Function} params.isInstalled - `() => boolean`
 * @param {number} [params.waitMs=2000] - Intervalo entre polls
 * @param {number} [params.maxWaitMs=600000] - Espera máxima
 * @param {AbortSignal} [params.signal] - Cancela a espera
 * @param {Function} [params.onWaiting] - Callback a cada poll (`{ model, waitedMs }`)
 * @returns {Promise<{installed: boolean, waitedMs: number, message: string}>}
 */
export async function waitForTranslateModel({
  model,
  isInstalled,
  waitMs = DEFAULT_WAIT_MS,
  maxWaitMs = DEFAULT_MAX_WAIT_MS,
  signal,
  onWaiting,
} = {}) {
  const startedAt = Date.now();

  if (typeof isInstalled !== 'function') {
    return { installed: false, waitedMs: 0, message: 'Verificação de modelo inválida.' };
  }

  for (;;) {
    if (signal?.aborted) {
      return { installed: false, waitedMs: Date.now() - startedAt, message: 'Operação cancelada.' };
    }

    if (isInstalled()) {
      return { installed: true, waitedMs: Date.now() - startedAt, message: '' };
    }

    const waitedMs = Date.now() - startedAt;
    if (waitedMs >= maxWaitMs) {
      return {
        installed: false,
        waitedMs,
        message:
          `O modelo "${model}" não foi baixado em ${Math.round(maxWaitMs / 1000)}s. ` +
          'Abra a aba Transcrever e baixe o modelo antes de traduzir.',
      };
    }

    onWaiting?.({ model, waitedMs });

    const remaining = Math.min(waitMs, maxWaitMs - waitedMs);
    await sleep(remaining, signal);
  }
}

/** Dorme `ms`, resolvendo mais cedo se o sinal abortar. */
function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}