/**
 * Fluxo `--audio-only`: extrai a melhor faixa de áudio disponível.
 */

import fs from 'node:fs';
import path from 'node:path';

import { createStreamGrabCore } from '../../core/index.js';
import { resolveSourceAdapterAsync } from '../../source-adapters.js';
import { sanitizeFilename, ensureMp4, getDefaultDownloadsDir } from '../../utils.js';
import { runDownloadFlow } from '../download.js';
import { createContext } from '../context.js';
import { printAnalysisError } from '../render.js';
import { ensureExt } from './url.js';

/** Resolve URL, extensão e metadados do áudio a baixar. */
async function resolveAudioTarget({ core, sourceType, target, headers, auth, io, dir, filename }) {
  if (sourceType === 'youtube' || sourceType === 'social') {
    const analysis = await core.analyze(target, { headers, auth });
    const info = analysis.info;
    const audio = info.adaptiveAudioFormats?.[0] || info.progressiveFormats?.[0];
    if (!audio?.url) {
      io.error('\n[ERRO] Nenhum audio encontrado para esta URL.');
      return { error: 'sem-audio' };
    }
    const ext = audio.container || 'm4a';
    io.log(`\nExtraindo audio (${ext}, ${audio.qualityLabel || 'melhor disponivel'})...`);
    return {
      url: audio.url,
      output: path.join(dir, ensureExt(filename, ext)),
      totalBytes: audio.contentLength || undefined,
      durationMs: (info.durationSeconds || 0) * 1000,
      outputArgs: [],
    };
  }

  io.log('\nExtraindo audio (FFmpeg -vn -c:a copy)...');
  return {
    url: target,
    output: path.join(dir, ensureMp4(filename)),
    totalBytes: undefined,
    durationMs: undefined,
    outputArgs: ['-vn', '-c:a', 'copy'],
  };
}

export async function runAudioOnlyFlow({ target, io = console, headers, auth, options }) {
  const core = createStreamGrabCore();
  const adapter = await resolveSourceAdapterAsync(target, headers);
  const sourceType = adapter.id;
  if (sourceType === 'unknown') {
    io.error('\n[ERRO] A URL nao parece ser uma fonte suportada.');
    return { code: 1, ok: false, error: 'UNSUPPORTED_SOURCE' };
  }

  const filename = options.filename ? sanitizeFilename(options.filename) : 'audio';
  const dir = options.outputDir ? path.resolve(options.outputDir) : getDefaultDownloadsDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    io.error(`\n[ERRO] Nao foi possivel usar a pasta "${dir}": ${err.message}`);
    return { code: 1, ok: false };
  }

  let resolved;
  try {
    resolved = await resolveAudioTarget({ core, sourceType, target, headers, auth, io, dir, filename });
  } catch (err) {
    printAnalysisError(io, err);
    return { code: 1, ok: false, error: err };
  }
  if (resolved.error) return { code: 1, ok: false, error: resolved.error };

  const ctx = createContext(io);
  const { url, output, totalBytes, durationMs, outputArgs } = resolved;
  const result = await runDownloadFlow(ctx, { url, output, headers, totalBytes, durationMs, outputArgs });
  if (result.ok) {
    io.log('\nDownload concluido!');
    io.log(`Arquivo salvo em: ${output}`);
    return { code: 0, ok: true, output };
  }
  if (result.interrupted) return { code: 130, ok: false, interrupted: true };
  io.log('\nO download nao pode ser concluido. Revise a URL e tente novamente.');
  return { code: 1, ok: false, error: result.error || 'falha' };
}
