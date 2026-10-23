/**
 * panel-transcribe.js — Painel de transcrição (view "Transcrever") — barrel.
 *
 * Consome a API do preload (window.api.transcribe*):
 *  - transcribeCheck → status do engine                     → ./panel-transcribe/engine.js
 *  - transcribeModels / transcribeModelDownload / ...       → panel-transcribe-model.js
 *  - transcribeStart / transcribeCancel / transcribeRetry   → ./panel-transcribe/start.js e jobs.js
 *  - eventos: onTranscribeProgress/Log/Done/Error/...       → ./panel-transcribe/events.js
 *
 * O job manager roda no main process (limite de concorrência, retry,
 * persistência); este painel apenas reflete o estado via eventos.
 * Renderização da lista vive em panel-transcribe-jobs.js.
 */

export { createTranscribePanel } from './panel-transcribe/controller.js';
