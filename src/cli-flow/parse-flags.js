/**
 * CLI flow — parse all CLI flags and config into a normalized options object.
 */

import { DEFAULT_TURBO_CHUNKS } from '../cli/turbo.js';
import { loadConfig, parseCliHeaders, parseCliAuth, applyProviderHeaders } from '../cli/config.js';

/**
 * Parse argv + config.json into a flat options object.
 * Also prints flag-related log messages to safeIo.
 */
export function parseCliFlags(argv, projectRoot, safeIo) {
  const config = loadConfig(projectRoot, safeIo);
  let useCurlFlag = argv.includes('--curl-impersonate') || argv.includes('--ci');
  const forceYouTube = argv.includes('--youtube');
  let headers = applyProviderHeaders({
    url: '',
    headers: { ...config.headers, ...parseCliHeaders(argv) },
    argv,
  });

  const legacyFlow = process.env.STREAMGRAB_LEGACY_FLOW === '1';
  if (legacyFlow) {
    useCurlFlag = false;
    safeIo.log('[legacy] STREAMGRAB_LEGACY_FLOW=1 — usando fluxos de download legados.');
  }

  // Autenticacao do yt-dlp
  const cliAuth = parseCliAuth(argv);
  const auth = {
    cookiesFile: cliAuth.cookiesFile || config.cookiesFile || '',
    cookiesFromBrowser: cliAuth.cookiesFromBrowser || config.cookiesFromBrowser || '',
  };
  if (auth.cookiesFile) safeIo.log(`[auth] Usando cookies do arquivo: ${auth.cookiesFile}`);
  if (auth.cookiesFromBrowser) safeIo.log(`[auth] Usando cookies do navegador: ${auth.cookiesFromBrowser}`);

  // P12.1: multi-audio and subtitle flags
  const audioLanguageIdx = argv.indexOf('--audio-lang');
  const audioLanguage = audioLanguageIdx !== -1 ? (argv[audioLanguageIdx + 1] || '') : '';
  const allAudio = argv.includes('--all-audio');
  const subsIdx = argv.indexOf('--subs');
  const subLanguages = subsIdx !== -1
    ? (argv[subsIdx + 1] === 'all' ? ['all'] : (argv[subsIdx + 1] || '').split(',').map((s) => s.trim()).filter(Boolean))
    : [];
  const embedSubs = argv.includes('--embed-subs');

  if (audioLanguage) safeIo.log(`[audio] Idioma selecionado: ${audioLanguage}`);
  if (allAudio) safeIo.log('[audio] Modo multi-audio ativado (todas as faixas)');
  if (subLanguages.length) safeIo.log(`[subs] Legendas selecionadas: ${subLanguages.join(', ')}`);
  if (embedSubs) safeIo.log('[subs] Legendas serao embutidas no video');

  // Turbo
  const turboEnabled = !legacyFlow && (argv.includes('--turbo') ? true : config.turbo === true);
  let turboChunks = DEFAULT_TURBO_CHUNKS;
  const chunksIdx = argv.indexOf('--chunks');
  if (chunksIdx !== -1 && Number(argv[chunksIdx + 1]) > 0) turboChunks = Number(argv[chunksIdx + 1]);
  else if (config.turboChunks > 0) turboChunks = config.turboChunks;
  if (turboEnabled) safeIo.log(`[turbo] Download paralelo ativado (${turboChunks} conexoes).`);

  // P6.2 — Smart Turbo
  const smartTurboFlag = argv.includes('--smart-turbo') ? true : argv.includes('--no-smart-turbo') ? false : config.smartTurbo;
  const smartTurboEnabled =
    turboEnabled &&
    smartTurboFlag !== false &&
    (smartTurboFlag === true || (smartTurboFlag && typeof smartTurboFlag === 'object'));
  if (smartTurboEnabled) {
    const opts = typeof smartTurboFlag === 'object' ? smartTurboFlag : {};
    const detail = opts.max ? ` (max ${opts.max}, janela ${opts.windowMs || 1200}ms)` : '';
    safeIo.log(`[turbo] Smart Turbo ativado${detail} — concurrency adaptativa (rampa/backoff).`);
  } else if (turboEnabled && smartTurboFlag !== false) {
    safeIo.log('[turbo] Smart Turbo desligado (pool fixo) — habilite via config.smartTurbo.');
  }

  // P6.1 — Resume
  const resumeEnabled = !argv.includes('--no-resume') && config.resume !== false;
  if (turboEnabled && !resumeEnabled) safeIo.log('[resume] Desativado (--no-resume): interrupcoes descartam o parcial.');

  return {
    useCurlFlag, forceYouTube, config, headers, legacyFlow, auth,
    audioLanguage, allAudio, subLanguages, embedSubs,
    turboEnabled, turboChunks, smartTurboEnabled, smartTurboFlag, resumeEnabled,
  };
}
