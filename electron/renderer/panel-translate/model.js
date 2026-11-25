/**
 * Seção de modelos do painel de tradução.
 */

/** Cria a seção de modelos (select + botão de download). */
export function createTranslateModelSection({ api, doc }) {
  let models = new Map();
  let defaultModel = 'qwen3-4b';

  function renderSelect() {
    const select = doc.getElementById('translateModelSelect');
    if (!select) return;
    select.textContent = '';
    for (const status of models.values()) {
      const option = doc.createElement('option');
      option.value = status.model;
      option.textContent = status.installed ? status.label : `${status.label} — não baixado`;
      select.appendChild(option);
    }
    select.value = models.has(defaultModel) ? defaultModel : [...models.keys()][0] || '';
  }

  async function refresh() {
    const res = await api().translateModels();
    if (!res?.ok) return;
    defaultModel = res.defaultModel || defaultModel;
    models = new Map((res.models || []).map((status) => [status.model, status]));
    renderSelect();
  }

  return { refresh, renderSelect, getModels: () => models };
}