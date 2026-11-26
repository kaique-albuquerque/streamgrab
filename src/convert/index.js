/**
 * Conversão de vídeo local para MKV (remux, sem re-encode).
 *
 * Uso:
 *   const r = await convertToMkv({ inputPath: '/v/a.mp4' });
 *   console.log(r.outputPath); // /v/a.mkv
 */

import fs from 'node:fs';
import path from 'node:path';
import { ffmpegService } from '../ffmpeg/service.js';
import { nextAvailableName } from '../core/filenames.js';
import { buildRemuxArgs } from './args.js';
import { ConvertError } from './errors.js';
import { validateInput } from './validate.js';

export { ConvertError };
export { buildRemuxArgs } from './args.js';

/** Normaliza o percentual para 0..100. */
function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

/**
 * Converte um vídeo para MKV.
 *
 * @param {object} options
 * @param {string} options.inputPath - Arquivo de vídeo
 * @param {string} [options.outputPath] - Default: `<base>.mkv` ao lado
 * @param {AbortSignal} [options.signal]
 * @param {Function} [options.onProgress] - `({ percent, outMs, totalMs })`
 * @param {Function} [options.onLog]
 * @param {object} [options.deps] - Injeção (testes): `{ run }`
 * @returns {Promise<{outputPath: string, size: number, durationMs: number, alreadyMkv: boolean}>}
 */
export async function convertToMkv({
  inputPath,
  outputPath,
  signal,
  onProgress,
  onLog,
  deps = {},
} = {}) {
  const startedAt = Date.now();
  const run = deps.run || (({ args, onProgress: onProg, signal: sig }) =>
    ffmpegService.run({ args, onProgress: onProg, signal: sig }));

  const { ext, size: inputSize } = validateInput(inputPath);

  // Já é MKV: nada a fazer (evita `ffmpeg -i x.mkv -c copy x.mkv`).
  if (ext === 'mkv') {
    return { outputPath: inputPath, size: inputSize, durationMs: 0, alreadyMkv: true };
  }

  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  const target = outputPath
    || nextAvailableName(path.join(dir, `${base}.mkv`), (p) => fs.existsSync(p));

  if (signal?.aborted) {
    throw new ConvertError('Operação cancelada.', { code: 'CANCELLED' });
  }

  onLog?.(`[convert] ${path.basename(inputPath)} → ${path.basename(target)} (remux)`);

  const { promise } = run({
    args: buildRemuxArgs({ input: inputPath, output: target }),
    signal,
    onProgress: ({ key, value }) => {
      if (key === 'out_time_ms' || key === 'out_time') {
        const outMs = Number(value) || 0;
        onProgress?.({ percent: clampPercent((outMs / 1000) * 0), outMs, totalMs: 0 });
      }
    },
  });

  let result;
  try {
    result = await promise;
  } catch (err) {
    try { fs.rmSync(target, { force: true }); } catch { /* ignora */ }
    throw new ConvertError(`Falha na conversão: ${err?.message || err}`, { code: 'FFMPEG_ERROR' });
  }

  if (signal?.aborted) {
    try { fs.rmSync(target, { force: true }); } catch { /* ignora */ }
    throw new ConvertError('Operação cancelada.', { code: 'CANCELLED' });
  }

  if (!result?.ok || !fs.existsSync(target) || fs.statSync(target).size === 0) {
    try { fs.rmSync(target, { force: true }); } catch { /* ignora */ }
    const detail = String(result?.stderr || '').slice(-400);
    throw new ConvertError(
      'O FFmpeg não conseguiu converter (codec incompatível com MKV?). Tente re-encodar manualmente.',
      { code: 'FFMPEG_FAILED', detail },
    );
  }

  const size = fs.statSync(target).size;
  onProgress?.({ percent: 100, outMs: 0, totalMs: 0 });
  onLog?.(`[convert] OK: ${path.basename(target)}`);

  return { outputPath: target, size, durationMs: Date.now() - startedAt, alreadyMkv: false };
}

export default convertToMkv;