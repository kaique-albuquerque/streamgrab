/**
 * CLI flow — barrel re-exports and main orchestrator.
 */

import fs from 'node:fs';
import path from 'node:path';

import { createStreamGrabCore } from '../core/index.js';
import { checkFfmpeg } from '../ffmpeg.js';
import { normalizeUrl, sanitizeFilename, ensureMp4, getDefaultDownloadsDir } from '../utils.js';
import { createAnswerSource, createContext, onInterrupt } from '../cli/context.js';
import { printHeader, printUsage, printFfmpegHelp, resolveExistingFile } from '../cli/ui.js';
import { applyProviderHeaders } from '../cli/config.js';

import { parseCliFlags } from './parse-flags.js';
import { analyzeAndChooseSource } from './analyze-source.js';
import { dispatchDownload, interpretResult } from './execute-download.js';

export { parseCliFlags } from './parse-flags.js';
export { analyzeAndChooseSource, ADAPTER_BASED_SOURCES } from './analyze-source.js';
export { dispatchDownload, interpretResult } from './execute-download.js';

export async function runCliSession({
  argv = [],
  projectRoot,
  ask,
  io,
  answers = {},
  registerCancel,
} = {}) {
  const safeIo = {
    log: (...parts) => console.log(...parts),
    error: (...parts) => console.error(...parts),
    onProgress: null, onProgressEnd: null, onStatus: null, onState: null,
    ...io,
  };
  const answerFn = ask || createAnswerSource(answers);
  const ctx = createContext(safeIo);
  registerCancel?.(() => onInterrupt(ctx));

  const core = createStreamGrabCore();

  if (argv.includes('--help') || argv.includes('-h')) {
    printUsage(safeIo);
    return { code: 0, ok: true };
  }
  printHeader(safeIo);

  // 1. Parse flags
  const flags = parseCliFlags(argv, projectRoot, safeIo);
  let { headers, useCurlFlag } = flags;

  // 2. FFmpeg check
  safeIo.onState?.({ state: 'ffmpeg-check' });
  safeIo.log('\nVerificando FFmpeg...');
  if (!(await checkFfmpeg())) {
    safeIo.error('\n[ERRO] FFmpeg nao foi encontrado localmente nem no PATH do sistema.');
    printFfmpegHelp(safeIo);
    return { code: 1, ok: false };
  }
  safeIo.log('FFmpeg OK.');

  // 3. Analyze source & choose variant
  const source = await analyzeAndChooseSource({
    answerFn, safeIo, core, headers,
    forceYouTube: flags.forceYouTube,
    useCurlFlag,
    legacyFlow: flags.legacyFlow,
  });
  if (source.earlyReturn) return source.earlyReturn;
  ({ headers, useCurlFlag } = source);

  // 4. Output path
  const rawName = await answerFn('\nNome do arquivo (sem extensao): ');
  const fileName = ensureMp4(sanitizeFilename(rawName));
  const defaultDir = getDefaultDownloadsDir();
  const rawDir = await answerFn(`Pasta de saida (Enter = ${defaultDir}): `);
  const dir = rawDir.trim() ? path.resolve(rawDir.trim()) : defaultDir;
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    safeIo.error(`\n[ERRO] Nao foi possivel usar a pasta "${dir}": ${err.message}`);
    return { code: 1, ok: false };
  }
  let output = path.join(dir, fileName);
  const resolved = await resolveExistingFile(answerFn, safeIo, output);
  if (resolved.action === 'cancel') {
    safeIo.log('\nCancelado.');
    return { code: 0, ok: false, cancelled: true };
  }
  output = resolved.output;
  safeIo.log(`\nSalvando em: ${output}`);
  safeIo.onState?.({ state: 'ready', output, targetUrl: source.targetUrl });

  // 5. Prepare download plan
  let preparedPlan;
  try {
    preparedPlan = await source.adapter.prepareDownload({
      url: source.url, headers, output,
      analysis: source.info, selectedUrl: source.targetUrl,
      auth: flags.auth,
      audioLanguage: flags.audioLanguage || undefined,
      allAudio: flags.allAudio || false,
    });
    source.targetUrl = preparedPlan?.downloadUrl || source.targetUrl;
  } catch (err) {
    safeIo.error(`\n[ERRO] ${err.message}`);
    return { code: 1, ok: false, error: err.code || 'prepare-download' };
  }

  // 6. Dispatch download
  const result = await dispatchDownload({
    ctx, answerFn, preparedPlan,
    sourceType: source.sourceType, targetUrl: source.targetUrl,
    output, headers: source.headers,
    useCurlFlag,
    turboEnabled: flags.turboEnabled,
    turboChunks: flags.turboChunks,
    resumeEnabled: flags.resumeEnabled,
    smartTurboEnabled: flags.smartTurboEnabled,
    smartTurboFlag: flags.smartTurboFlag,
    safeIo,
  });

  // 7. Interpret result
  const outcome = interpretResult(result, output, source.targetUrl);
  if (outcome.log) safeIo.log(outcome.log);
  return outcome;
}

export function createInterruptHandler(io) {
  const ctx = createContext(io);
  return () => onInterrupt(ctx);
}
