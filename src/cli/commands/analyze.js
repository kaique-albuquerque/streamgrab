/**
 * Subcomando `streamgrab analyze <url>`.
 */

import { createStreamGrabCore } from '../../core/index.js';
import { fetchPlaylist } from '../../hls.js';
import { resolveSourceAdapterAsync } from '../../source-adapters.js';
import { normalizeUrl } from '../../utils.js';
import { loadConfig, applyProviderHeaders } from '../config.js';
import { renderAnalysis, printAnalysisError } from '../render.js';
import { isValidHttpUrl } from './url.js';

export async function runAnalyzeCommand({ url, projectRoot, io = console, flags = {} }) {
  const target = normalizeUrl(url);
  if (!target || !isValidHttpUrl(target)) {
    io.error('\n[ERRO] URL invalida. Uso: streamgrab analyze <url>');
    return { code: 1, ok: false };
  }

  const config = loadConfig(projectRoot, io);
  const headers = applyProviderHeaders({
    url: target,
    headers: { ...config.headers, ...(flags.headers || {}) },
    argv: flags.argv || [],
  });
  const auth = {
    cookiesFile: flags.cookiesFile || config.cookiesFile || '',
    cookiesFromBrowser: flags.cookiesFromBrowser || config.cookiesFromBrowser || '',
  };

  const core = createStreamGrabCore();
  const adapter = await resolveSourceAdapterAsync(target, headers);
  const sourceType = adapter.id;
  if (sourceType === 'unknown') {
    io.error('\n[ERRO] A URL nao parece ser uma fonte suportada.');
    return { code: 1, ok: false, error: 'UNSUPPORTED_SOURCE' };
  }

  let info;
  try {
    info = await analyzeBySourceType({ core, adapter, sourceType, target, headers, auth });
  } catch (err) {
    printAnalysisError(io, err);
    return { code: 1, ok: false, error: err };
  }

  renderAnalysis(io, { url: target, adapter, info, json: flags.json === true });
  return { code: 0, ok: true, info, sourceType };
}

/** Escolhe a análise adequada para o tipo de fonte detectado. */
async function analyzeBySourceType({ core, adapter, sourceType, target, headers, auth }) {
  if (sourceType === 'youtube' || sourceType === 'social') {
    const analysis = await core.analyze(target, { headers, auth });
    return analysis.info;
  }
  if (sourceType === 'hls') {
    return fetchPlaylist(target, headers);
  }
  if (sourceType === 'dash') {
    return adapter.analyze({ url: target, headers });
  }
  return { kind: 'direct', totalDuration: 0 };
}
