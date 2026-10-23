/**
 * P3/P5 - Provider HLS normalizado (barrel, src/providers/hls/index.js)
 *
 * Envolve src/hls.js (fetch + parse de playlists) e reconhece URLs da Media
 * Stream/mdstrm como HLS.
 *
 * Mantem analyze()/prepareDownload() legados e adiciona resolve()/
 * prepareDownloadPlan() nativos do contrato V2.
 *
 * Implementacao:
 *  - ./context.js     → requestContext e mediaInfo
 *  - ./capabilities.js → capabilities/strategyHints
 *  - ./playlist.js    → fetch/parse, formats, resolucao e plano
 *  - ./refresh.js     → renovacao de URL mdstrm
 *  - ./provider.js    → objeto hlsProvider
 */

export { hlsProvider } from './provider.js';
