/**
 * Estado compartilhado da seção de modelos Whisper.
 */

export const LIST_ID = 'transcribeModelList';
export const SELECT_ID = 'transcribeModelSelect';
export const HINT_ID = 'transcribeModelsHint';

export function createModelState() {
  return {
    /** model → status devolvido pelo main process. */
    models: new Map(),
    defaultModel: 'small',
    selectedModel: 'small',
    downloadingModel: null,
    /** Modelo aguardando confirmação de exclusão (confirmação inline). */
    pendingDelete: null,
    wired: false,
  };
}

export function labelOf(state, model) {
  return state.models.get(model)?.label || model;
}

export function statusOf(state, model) {
  return state.models.get(model) || null;
}
