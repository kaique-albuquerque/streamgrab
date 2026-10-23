/**
 * Download por modo de mux (copy / adtstoasc / aac) com fallback.
 */

import { startDownload } from '../../ffmpeg/muxer.js';
import { MODE_LABELS } from '../context.js';
import { createProgressReporter } from '../progress.js';
import { print403 } from '../ui.js';
import { analyzeFailure, cleanupPartial, printStderrTail } from './diagnostics.js';

export async function runDownloadFlow(ctx, { url, output, headers, extraArgs = [], outputArgs = [], totalBytes, durationMs, label }) {
  let lastResult = null;

  for (let modeIndex = 0; modeIndex < MODE_LABELS.length; modeIndex++) {
    ctx.io.log(`\nBaixando - modo: ${MODE_LABELS[modeIndex]}`);
    ctx.io.onState?.({ state: `running:${modeIndex}`, label: MODE_LABELS[modeIndex], modeIndex });
    const progress = createProgressReporter(ctx.io, { totalBytes, durationMs, label });
    const { promise, stop } = startDownload({
      url,
      output,
      headers,
      modeIndex,
      extraArgs,
      outputArgs,
      onProgress: progress.update,
    });

    ctx.currentFfmpeg = { stop };
    ctx.interruptHandled = false;
    const result = await promise;
    ctx.currentFfmpeg = null;
    progress.finish(result.ok);

    if (result.ok) {
      return { ok: true, modeIndex };
    }
    if (result.interrupted || ctx.interruptHandled) {
      ctx.io.log('\nDownload interrompido.');
      cleanupPartial(output);
      return { ok: false, interrupted: true };
    }

    lastResult = result;
    const reason = analyzeFailure(result);
    if (reason === '403') {
      print403(ctx.io);
      cleanupPartial(output);
      return { ok: false, error: '403' };
    }

    ctx.io.log(`[AVISO] Falha no modo "${MODE_LABELS[modeIndex]}": ${reason}`);
    if (modeIndex < MODE_LABELS.length - 1) {
      ctx.io.log('Tentando um modo alternativo...');
      ctx.io.onState?.({ state: `retrying:${modeIndex}`, label: MODE_LABELS[modeIndex], modeIndex });
    }
  }

  cleanupPartial(output);
  printStderrTail(ctx.io, lastResult, url);
  return { ok: false, error: 'other' };
}
