/**
 * CLI flow — download dispatch and result handling.
 */

import { MODE_LABELS } from '../cli/context.js';
import { runDownloadFlow, runMuxedDownloadFlow, runMuxMultiDownloadFlow } from '../cli/download.js';
import { runTurboDownloadFlow, runTurboMuxedDownloadFlow } from '../cli/turbo.js';
import { runCurlDownloadFlow } from '../cli/curl-flow.js';
import { ADAPTER_BASED_SOURCES } from './analyze-source.js';

/**
 * Dispatch the correct download flow based on strategy, turbo, curl flags.
 * Returns the download result object.
 */
export async function dispatchDownload({
  ctx, answerFn, preparedPlan, sourceType, targetUrl, output, headers,
  useCurlFlag, turboEnabled, turboChunks, resumeEnabled, smartTurboEnabled, smartTurboFlag, safeIo,
}) {
  const turboEligible = !useCurlFlag && (ADAPTER_BASED_SOURCES.has(sourceType) || sourceType === 'direct');

  if (preparedPlan?.strategy === 'mux') {
    const muxOpts = {
      videoUrl: preparedPlan.videoUrl, audioUrl: preparedPlan.audioUrl,
      output, headers,
      videoBytes: preparedPlan.videoBytes, audioBytes: preparedPlan.audioBytes,
      totalBytes: preparedPlan.totalBytes, durationMs: preparedPlan.durationMs,
    };
    if (turboEnabled) {
      let result = await runTurboMuxedDownloadFlow(ctx, muxOpts);
      if (!result.ok && result.error === 'no-range') {
        safeIo.log('\n[AVISO] Turbo indisponivel; voltando ao fluxo padrao...');
        result = await runMuxedDownloadFlow(ctx, muxOpts);
      }
      return result;
    }
    return runMuxedDownloadFlow(ctx, muxOpts);
  }

  if (preparedPlan?.strategy === 'mux-multi') {
    const muxMultiOpts = {
      videoUrl: preparedPlan.videoUrl,
      audioUrls: preparedPlan.audioUrls || [],
      audioLabels: preparedPlan.audioLabels || [],
      audioLanguages: preparedPlan.audioLanguages || [],
      output, headers,
      totalBytes: preparedPlan.totalBytes, durationMs: preparedPlan.durationMs,
    };
    safeIo.log(`\nBaixando video + ${muxMultiOpts.audioUrls.length} faixa(s) de audio...`);
    return runMuxMultiDownloadFlow(ctx, muxMultiOpts);
  }

  if (turboEnabled && turboEligible) {
    let result = await runTurboDownloadFlow(ctx, {
      url: targetUrl, output, headers,
      totalBytes: preparedPlan?.totalBytes, durationMs: preparedPlan?.durationMs,
      chunkCount: turboChunks, resume: resumeEnabled,
      smartTurbo: smartTurboEnabled ? smartTurboFlag : false,
    });
    if (!result.ok && result.error === 'no-range') {
      safeIo.log('[AVISO] Turbo indisponivel; voltando ao fluxo padrao...');
      result = await runDownloadFlow(ctx, {
        url: targetUrl, output, headers,
        totalBytes: preparedPlan?.totalBytes, durationMs: preparedPlan?.durationMs,
      });
    }
    return result;
  }

  if (useCurlFlag && sourceType === 'hls') {
    return runCurlDownloadFlow(ctx, { ask: answerFn, url: targetUrl, output, headers });
  }
  return runDownloadFlow(ctx, {
    url: targetUrl, output, headers,
    totalBytes: preparedPlan?.totalBytes, durationMs: preparedPlan?.durationMs,
  });
}

/**
 * Interpret the download result and return the final session outcome.
 */
export function interpretResult(result, output, targetUrl) {
  if (result?.error === 'cancelado') {
    return { code: 0, ok: false, cancelled: true, log: '\nCancelado.' };
  }
  if (result?.error === 'curl-ausente') {
    return { code: 1, ok: false };
  }
  if (result.ok) {
    return {
      code: 0, ok: true, output, targetUrl,
      mode: MODE_LABELS[result.modeIndex],
      log: `\nDownload concluido!\nArquivo salvo em: ${output}`,
    };
  }
  if (result.interrupted) {
    return { code: 130, ok: false, interrupted: true };
  }
  return {
    code: 1, ok: false, error: result.error || 'falha',
    log: '\nO download nao pode ser concluido. Revise a URL e tente novamente.',
  };
}
