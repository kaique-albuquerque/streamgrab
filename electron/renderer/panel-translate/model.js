/**
 * Seção de modelos do painel de tradução.
 */

/** Cria a seção de modelos (select + botão de download). */
export function createTranslateModelSection({ api, doc }) {
  // Aceita tanto a função `() => window.api` quanto o objeto direto.
  const apiFn = typeof api === 'function' ? api : () => api;
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
    bindSelect();
    renderDownloadButton();
  }

  /**
   * Mostra o botão "Baixar" só quando o modelo selecionado não está instalado.
   * Sem isso o usuário via o aviso "modelo não baixado" sem ter como baixar.
   */
  function renderDownloadButton() {
    const btn = doc.getElementById('translateModelDownloadBtn');
    if (!btn) return;
    // Usa o valor do <select> quando disponível; em DOMs sem valor (testes),
    // cai no default — o botão nunca deve ficar oculto por causa disso.
    const selected = models.get(selectValue()) || models.get(defaultModel) || null;
    btn.hidden = Boolean(selected?.installed);
    renderDeleteButton(selected);
  }

  /** Mostra o botão "Excluir" só quando o modelo selecionado está instalado. */
  function renderDeleteButton(selected) {
    const btn = doc.getElementById('translateModelDeleteBtn');
    if (!btn) return;
    btn.hidden = !selected?.installed;
  }

  /** Modelo selecionado no <select> (ou o default). */
  function selectValue() {
    const select = doc.getElementById('translateModelSelect');
    return select?.value || defaultModel;
  }

  /** Listener de troca do <select>: atualiza os botões. */
  function bindSelect() {
    const select = doc.getElementById('translateModelSelect');
    if (!select || select.dataset?.wired === '1') return;
    if (select.dataset) select.dataset.wired = '1';
    select.addEventListener?.('change', () => renderDownloadButton());
  }

  async function refresh() {
    const res = await apiFn().translateModels();
    if (!res?.ok) return;
    defaultModel = res.defaultModel || defaultModel;
    models = new Map((res.models || []).map((status) => [status.model, status]));
    renderSelect();
  }

  return { refresh, renderSelect, getModels: () => models };
}