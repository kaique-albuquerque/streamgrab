/**
 * Traduz `-progress pipe:1` do FFmpeg em percentual.
 *
 * O FFmpeg so informa o tamanho total no fim, entao sem `durationMs` o
 * percentual e estimado pela taxa de bytes. A estimativa precisa de uma
 * amostra anterior para calcular a velocidade da janela; sem semear a
 * primeira amostra o percentual ficava permanentemente em 0.
 *
 * Atencao: `out_time_us` e `out_time_ms` chegam ambos em MICROSSEGUNDOS
 * (o sufixo `_ms` e historico do FFmpeg). Tratar `out_time_ms` como
 * milissegundos saturam o percentual em 100% logo no inicio.
 */

/** Janela minima (ms) entre reestimativas do total previsto. */
const WINDOW_MS = 1000;

/** Janela (ms) de aquecimento antes de estimar (evita numeros instaveis). */
const WARMUP_MS = 1500;

/** Fracao da duracao ja decorrida usada para prever o restante. */
const REMAINING_FACTOR = 0.5;

/** Estimativa minima de restante (segundos) para nao saturar em 99%. */
const MIN_REMAINING_SEC = 5;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {(update: object) => void} onProgress
 * @param {number} durationMs duracao conhecida (0 = desconhecida).
 * @param {{ minPercent?: number }} [options] piso do percentual (ex.: merge
 *   ja anunciado em 90%) — evita a barra regredir para 0%.
 */
export function makeFfmpegProgress(onProgress, durationMs, { minPercent = 0 } = {}) {
  const floor = clamp(Number(minPercent) || 0, 0, 100);
  let outMs = 0;
  let totalSize = 0;
  let startedAtMs = 0;
  let lastSize = 0;
  let lastSampleMs = 0;
  let estimatedTotal = 0;
  let lastPercent = floor;

  /** Semeia a amostra na primeira leitura para a janela ter referencia. */
  function seedSample(now) {
    if (lastSampleMs) return;
    lastSampleMs = now;
    lastSize = totalSize;
  }

  /** Atualiza o total previsto com a velocidade da ultima janela. */
  function refreshEstimate(now, elapsedSec, speed) {
    const windowMs = now - lastSampleMs;
    if (windowMs < WINDOW_MS) return;

    const windowSpeed = (totalSize - lastSize) / (windowMs / 1000);
    // Sem crescimento na janela (ex.: 48 bytes iniciais do FFmpeg) nao ha o
    // que estimar — usar a media acumulada aqui gerava percentuais falsos.
    if (windowSpeed > 0) {
      const blended = speed * 0.3 + windowSpeed * 0.7;
      const remaining = blended * Math.max(MIN_REMAINING_SEC, elapsedSec * REMAINING_FACTOR);
      estimatedTotal = Math.max(estimatedTotal, totalSize + remaining);
    }
    lastSize = totalSize;
    lastSampleMs = now;
  }

  function deterministicPercent() {
    if (durationMs <= 0 || outMs <= 0) return null;
    return Math.min(100, Math.round((outMs / durationMs) * 1000) / 10);
  }

  function estimatedPercent(now, elapsedSec, speed) {
    if (totalSize <= 0 || elapsedSec * 1000 < WARMUP_MS) return null;
    seedSample(now);
    refreshEstimate(now, elapsedSec, speed);
    if (estimatedTotal <= 0) return null;
    return Math.min(100, Math.round((totalSize / estimatedTotal) * 1000) / 10);
  }

  return ({ key, value }) => {
    const now = Date.now();
    if (!startedAtMs) startedAtMs = now;
    // Ambos os campos vem em microssegundos (`_ms` e apenas o nome legado).
    if (key === 'out_time_us' || key === 'out_time_ms') outMs = Number(value) / 1000;
    else if (key === 'total_size') totalSize = Number(value);

    const elapsedSec = (now - startedAtMs) / 1000;
    const speed = elapsedSec > 0 ? totalSize / elapsedSec : 0;

    const raw = deterministicPercent() ?? estimatedPercent(now, elapsedSec, speed);
    // Monotono: um novo total previsto nunca faz a barra regredir.
    lastPercent = Math.min(100, Math.max(lastPercent, floor, raw ?? 0));

    const remainingBytes = Math.max(0, estimatedTotal - totalSize);
    const etaSeconds = estimatedTotal > 0 && speed > 0 ? remainingBytes / speed : null;

    onProgress({ bytesDownloaded: totalSize, totalBytes: 0, percent: lastPercent, speed, etaSeconds });
  };
}
