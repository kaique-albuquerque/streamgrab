/**
 * Subcomando `streamgrab download <url>`.
 */

import { normalizeUrl, sanitizeFilename } from '../../utils.js';
import { loadConfig, applyProviderHeaders } from '../config.js';
import { runCliSession } from '../../cli-flow/index.js';
import { runAudioOnlyFlow } from './audio-only.js';
import { resolveQualityChoice } from './quality.js';
import { isValidHttpUrl } from './url.js';

export async function runDownloadCommand({ url, projectRoot, io = console, options = {} }) {
  const target = normalizeUrl(url);
  if (!target || !isValidHttpUrl(target)) {
    io.error('\n[ERRO] URL invalida. Uso: streamgrab download <url>');
    return { code: 1, ok: false };
  }

  const config = loadConfig(projectRoot, io);
  const headers = applyProviderHeaders({
    url: target,
    headers: { ...config.headers, ...(options.headers || {}) },
    argv: options.argv || [],
  });
  const auth = {
    cookiesFile: options.cookiesFile || config.cookiesFile || '',
    cookiesFromBrowser: options.cookiesFromBrowser || config.cookiesFromBrowser || '',
  };

  if (options.audioOnly) {
    return runAudioOnlyFlow({ target, io, headers, auth, options });
  }

  let qualityChoice = '';
  if (options.format) {
    const resolved = await resolveQualityChoice({ target, headers, auth, format: options.format, io });
    if (resolved.error) return { code: 1, ok: false, error: resolved.error };
    qualityChoice = resolved.qualityChoice;
  }

  const answers = createNonInteractiveAnswers({
    url: target,
    filename: options.filename,
    outputDir: options.outputDir,
    qualityChoice,
    forceCurl: options.forceCurl,
  });
  const argv = buildDownloadArgv({ options, auth });

  return runCliSession({ argv, projectRoot, ask: answers.ask, io });
}

/** Respostas automáticas para o fluxo interativo do cli-flow. */
export function createNonInteractiveAnswers({ url, filename = '', outputDir = '', qualityChoice = '', forceCurl = false }) {
  const baseName = filename ? sanitizeFilename(filename) : 'video';
  return {
    async ask(question) {
      if (question.includes('URL do video/playlist')) return String(url || '');
      if (question.includes('Escolha (Enter = melhor disponivel)')) return String(qualityChoice || '');
      if (question.includes('Nome do arquivo')) return baseName;
      if (question.includes('Pasta de saida')) return String(outputDir || '');
      if (question.includes('(S)obrescrever, (N)ovo nome, (C)ancelar?')) return 'S';
      if (question.includes('Tentar contornar com curl-impersonate')) return forceCurl ? 'S' : '';
      return '';
    },
  };
}

/** Traduz as opções do subcomando em argv para o cli-flow. */
export function buildDownloadArgv({ options = {}, auth = {} }) {
  const argv = [];
  if (options.turbo) argv.push('--turbo');
  if (options.chunks > 0) argv.push('--chunks', String(options.chunks));
  if (options.noResume) argv.push('--no-resume');
  if (options.forceCurl) argv.push('--curl-impersonate');
  if (auth.cookiesFile) argv.push('--cookies', auth.cookiesFile);
  if (auth.cookiesFromBrowser) argv.push('--cookies-from-browser', auth.cookiesFromBrowser);
  // Preserva flags de provider que precisam chegar ao cli-flow.
  const srcArgv = options.argv || [];
  if (srcArgv.includes('--hotmart')) argv.push('--hotmart');
  return argv;
}
