/**
 * Emissão de progresso do download com throttle (a UI não precisa de um
 * evento por chunk de rede).
 */

export const PROGRESS_MIN_INTERVAL_MS = 250;

/**
 * Cria o emissor de progresso de um download.
 *
 * Emite quando o percentual inteiro muda, respeitando o intervalo mínimo
 * entre eventos — mas sempre emite ao chegar a 100%.
 *
 * @param {Function} [onProgress] - Callback do consumidor
 * @param {{ model: string, file: string, total: number }} context
 * @returns {(downloaded: number) => void}
 */
export function createProgressEmitter(onProgress, { model, file, total }) {
  let lastPercent = -1;
  let lastEmitAt = 0;

  return (downloaded) => {
    const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
    const now = Date.now();
    if (percent === lastPercent) return;
    if (percent !== 100 && now - lastEmitAt < PROGRESS_MIN_INTERVAL_MS) return;

    lastPercent = percent;
    lastEmitAt = now;
    onProgress?.({ stage: 'downloading', percent, downloaded, total, model, file });
  };
}
