/**
 * panel-transcribe-model.js — Catálogo de modelos Whisper na aba Transcrição.
 *
 * O catálogo (nomes, tamanhos, URLs e verificação de integridade) vive no
 * main process (src/transcribe/model-manager.js). Este módulo apenas lista os
 * modelos, reflete status/progresso e dispara download/exclusão via preload —
 * o renderer nunca escolhe caminho nem URL, apenas o id do modelo.
 *
 * Implementação dividida em `electron/renderer/transcribe-model/`.
 */

import { createModelState, statusOf } from './transcribe-model/state.js';
import { createHelpers } from './transcribe-model/dom.js';
import { createRenderer } from './transcribe-model/render.js';
import { createActions } from './transcribe-model/actions.js';
import { createEvents } from './transcribe-model/events.js';

export function createModelSection() {
  const state = createModelState();
  const ctx = { state, api: () => window.api };

  ctx.helpers = createHelpers(state);
  ctx.render = createRenderer(ctx);
  ctx.actions = createActions(ctx);
  ctx.events = createEvents(ctx);

  return {
    bind: ctx.events.bind,
    refreshModels: ctx.actions.refreshModels,
    renderModelProgress: ctx.render.renderModelProgress,
    getSelectedModel: () => state.selectedModel,
    isModelInstalled: (model) => Boolean(statusOf(state, model)?.installed),
  };
}
