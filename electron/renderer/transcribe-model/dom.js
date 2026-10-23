/**
 * Helpers de DOM da seção de modelos Whisper.
 */

import { formatBytes } from '../shared.js';
import { HINT_ID } from './state.js';

export function createHelpers(state) {
  function hint(text, isError = false) {
    const el = document.getElementById(HINT_ID);
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? 'var(--danger)' : '';
  }

  function stateText(status) {
    if (status.model === state.downloadingModel) return 'Baixando...';
    if (status.installed) return `Instalado (${formatBytes(status.size)})`;
    if (status.partialSize > 0) {
      return `Download incompleto (${formatBytes(status.partialSize)} de ~${formatBytes(status.expectedSize)}) — pode retomar`;
    }
    return `Não baixado (~${formatBytes(status.expectedSize)})`;
  }

  function makeBadge(text, kind = '') {
    const span = document.createElement('span');
    span.className = `transcribe-model-badge${kind ? ` transcribe-model-badge-${kind}` : ''}`;
    span.textContent = text;
    return span;
  }

  function makeButton(text, action, className = 'button button-ghost') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.dataset.action = action;
    btn.textContent = text;
    return btn;
  }

  return { hint, stateText, makeBadge, makeButton };
}
