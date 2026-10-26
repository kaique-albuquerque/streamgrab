/**
 * CLI flow — source analysis and variant choosing (barrel).
 *
 * Implementação em ./analyze-source/:
 *  - url-input.js        → leitura da URL e refresh mdstrm
 *  - adapter.js          → resolução do source adapter
 *  - sources-adapter.js  → análise de youtube/social
 *  - sources-playlist.js → análise HLS e DASH
 *  - index.js            → analyzeAndChooseSource
 */

export { ADAPTER_BASED_SOURCES, analyzeAndChooseSource } from './analyze-source/index.js';
