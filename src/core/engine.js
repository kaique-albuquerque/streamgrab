/**
 * P2.5 — DownloadEngine — ponto de entrada backward-compatible.
 *
 * O codigo foi decomposto em src/core/engine/:
 *  - helpers.js   — funcoes puras (progresso, ETA, mascaramento, etc)
 *  - runners/     — execucoes concretas de download (fetch, ffmpeg, curl, mux)
 *  - executor/    — executor padrao + resolvedor de adapter
 *  - lifecycle.js — pipeline de execucao
 *  - completion.js — tratamento de estado terminal
 *  - control.js   — pause/resume/cancel/dispose
 *  - index.js     — DownloadEngine (ciclo de vida do job)
 *
 * Este arquivo re-exporta tudo para manter compatibilidade com imports
 * existentes (src/core/index.js, src/core/registry.js, testes).
 */

export { DownloadEngine, createDownloadEngine, default } from './engine/index.js';
export { defaultResolveAdapter, createDefaultExecutor } from './engine/executor/index.js';
export { resolveFreshVariant } from './engine/helpers.js';
