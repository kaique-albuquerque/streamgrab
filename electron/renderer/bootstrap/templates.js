/**
 * Carrega templates HTML externos (tab, queue, history, settings) e os
 * insere no DOM antes de inicializar os controllers. Isso mantém o
 * index.html leve e os templates organizados por responsabilidade.
 * Templates grandes podem usar `<!--#include partial.html-->` para delegar
 * trechos a partials em ./templates/<nome>/.
 */

import { resolveIncludes } from '../template-include.js';

export async function loadTemplates() {
  const templates = ['tab', 'queue', 'history', 'transcribe', 'settings'];
  const base = new URL('./templates/', window.location.href);
  const target = document.getElementById('dynamicViews');
  for (const name of templates) {
    try {
      const res = await fetch(new URL(`${name}.html`, base));
      if (!res.ok) continue;
      const html = await resolveIncludes(await res.text(), base);
      if (name === 'tab') {
        // O tabTemplate é um <template> que vai no body (já existe no DOM)
        document.body.insertAdjacentHTML('beforeend', html);
      } else {
        target.insertAdjacentHTML('beforeend', html);
      }
    } catch {
      // Silencia erro de fetch (dev mode com file:// pode ter issues)
    }
  }
}
