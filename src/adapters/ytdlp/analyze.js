/**
 * Analise de URLs via yt-dlp (via youtube-dl-exec, binario standalone, sem
 * necessidade de Python).
 *
 * Usado pelos adaptadores finos de YouTube e redes sociais (Facebook,
 * Instagram, TikTok, X/Twitter, Reddit, Twitch, Vimeo, etc.). O yt-dlp mantem
 * as logicas de decifracao/anti-bot atualizadas pela comunidade; aqui apenas
 * consumimos o dump JSON (URLs ja decifradas) e reaproveitamos o fluxo
 * existente de download/mux do projeto.
 */

import { getYtDlpExec } from '../../core/binaries.js';
import { sleep } from '../../core/retry.js';
import { buildAnalysisFromInfo } from './analysis.js';
import { ytdlpAnalysisBreaker } from './circuit-breaker.js';
import {
  YTDLP_ANALYZE_MAX_ATTEMPTS,
  isLoginRequiredError,
  isSpawnBlockedError,
} from './constants.js';

/**
 * Opcoes padrao do yt-dlp para obter apenas o JSON de formatos.
 * - preferFreeFormats: prefere formatos com codecs abertos (vp9/opus) quando
 *   disponiveis, mantendo tambem os demais formatos no JSON.
 * Nota: --no-call-home e --youtube-skip-dash-manifest foram deprecados no
 * yt-dlp 2026+ (call-home removido; skip de manifesto DASH virou automatico),
 * entao nao sao mais enviados.
 */
export function buildBaseOptions() {
  return {
    dumpSingleJson: true,
    noWarnings: true,
    noCheckCertificates: true,
    preferFreeFormats: true,
  };
}

/**
 * Analisa qualquer URL suportada pelo yt-dlp e devolve a mesma estrutura de
 * analise esperada pelo CLI/Electron:
 *   { kind, pageUrl, title, videoId, durationSeconds, progressiveFormats,
 *     adaptiveFormats, adaptiveVideoFormats, adaptiveAudioFormats, variants }
 * Os variants de video adaptativo usam a URI "ytdlp-format:<formatId>" e os
 * progressivos usam a URL direta (mesmo contrato de src/youtube.js).
 */
export async function analyzeYtDlpUrl(url, headers = {}, auth = {}) {
  // Sprint 4.2: circuit breaker — reject immediately if platform is rate-limiting
  if (ytdlpAnalysisBreaker.isOpen()) {
    const err = new Error('yt-dlp analysis temporarily blocked (circuit breaker open). Try again later.');
    err.code = 'YTDLP_CIRCUIT_OPEN';
    throw err;
  }

  const userAgent = headers?.['user-agent'] || headers?.['User-Agent'];
  const cookiesFile = auth?.cookiesFile || '';
  const cookiesFromBrowser = auth?.cookiesFromBrowser || '';
  const baseOptions = {
    ...buildBaseOptions(),
    ...(userAgent ? { userAgent } : {}),
    ...(cookiesFile ? { cookies: cookiesFile } : {}),
    ...(cookiesFromBrowser ? { cookiesFromBrowser } : {}),
  };

  // P10: o spawn do yt-dlp pode ser bloqueado temporariamente pelo Windows
  // (Defender) na 1a execucao do binario recem-instalado — erro transitorio
  // (EPERM/EBUSY/access denied) que desaparece em alguns segundos. Erros reais
  // do yt-dlp (login, 403, formato) nao passam por retry.
  let info = null;
  let lastErr = null;
  for (let attempt = 1; attempt <= YTDLP_ANALYZE_MAX_ATTEMPTS; attempt++) {
    try {
      const exec = await getYtDlpExec();
      info = await exec(url, baseOptions);
      ytdlpAnalysisBreaker.recordSuccess();
      break;
    } catch (err) {
      lastErr = err;
      const stderr = String(err.stderr || err.message || '');
      if (!isSpawnBlockedError(stderr) || attempt === YTDLP_ANALYZE_MAX_ATTEMPTS) break;
      await sleep(2000 * attempt);
    }
  }

  if (!info) {
    const stderr = String(lastErr.stderr || lastErr.message || '');
    const needsAuth = isLoginRequiredError(stderr);
    const spawnBlocked = isSpawnBlockedError(stderr);

    // Sprint 4.2: record platform errors (403/429) in circuit breaker
    if (needsAuth && !spawnBlocked) {
      ytdlpAnalysisBreaker.recordFailure();
    }

    const cause = new Error(
      needsAuth
        ? `Conteudo autenticado/restrito: o yt-dlp nao conseguiu acessar sem login. Exporte os cookies do navegador (extensao "Get cookies.txt LOCALLY") e use --cookies <arquivo>, ou use --cookies-from-browser chrome/edge/firefox. Detalhes: ${lastErr.message || String(lastErr)}`
        : spawnBlocked
          ? `O Windows ainda esta verificando o yt-dlp (primeira execucao apos a instalacao). Aguarde alguns segundos e tente novamente. Detalhes: ${lastErr.message || String(lastErr)}`
          : `Nao foi possivel analisar o video com o yt-dlp: ${lastErr.message || String(lastErr)}`
    );
    cause.code = 'YTDLP_ANALYZE_FAILED';
    cause.stderr = lastErr.stderr || '';
    cause.needsAuth = needsAuth;
    throw cause;
  }

  return buildAnalysisFromInfo(info, url);
}
