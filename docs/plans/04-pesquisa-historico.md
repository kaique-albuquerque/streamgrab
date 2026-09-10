# Plano de Implementação — Pesquisa e Filtros no Histórico

> **Origem:** SPEC-04 — `docs/specs/04-pesquisa-historico.md`
> **Prioridade:** Média | **Esforço:** Baixo | **Riscos:** Mínimos

---

## 1. Dependências

| Recurso | Onde obter |
|---------|------------|
| `historyList()` | `electron/preload.cjs` — já existe |
| `renderHistoryItem()` | `electron/renderer/panels.js` — já existe |
| Entradas do histórico | `{ id, title, url, provider, format, status, size, date }` |
| Debounce | Implementação inline (sem lib externa) |

---

## 2. Etapas de Implementação

### Etapa 1 — Módulo de Filtros

**Arquivo:** `electron/renderer/history-filters.js` (NOVO)

```
export function createHistoryFilters({ container, searchInput, filterButtons, onFiltered }) {
  let entries = [];
  let activeFilters = {
    search: '',
    period: 'all',   // 'all' | '24h' | '7d' | '30d'
    status: 'all',   // 'all' | 'completed' | 'failed' | 'cancelled'
    sortBy: 'date',  // 'date' | 'title' | 'size' | 'provider'
    sortOrder: 'desc'
  };
  let debounceTimer = null;

  function setEntries(raw) {
    entries = Array.isArray(raw) ? raw : [];
    apply();
  }

  function apply() {
    const filtered = entries
      .filter(e => matchesSearch(e, activeFilters.search))
      .filter(e => matchesPeriod(e, activeFilters.period))
      .filter(e => matchesStatus(e, activeFilters.status))
      .sort(compareFn(activeFilters.sortBy, activeFilters.sortOrder));
    onFiltered(filtered);
  }

  function matchesSearch(entry, search) {
    if (!search) return true;
    const term = search.toLowerCase();
    return [entry.title, entry.url, entry.provider, entry.format]
      .some(field => String(field || '').toLowerCase().includes(term));
  }

  function matchesPeriod(entry, period) {
    if (period === 'all') return true;
    const entryDate = new Date(entry.date).getTime();
    const ms = period === '24h' ? 86400000
             : period === '7d' ? 604800000
             : period === '30d' ? 2592000000
             : 0;
    return Date.now() - entryDate <= ms;
  }

  function matchesStatus(entry, status) {
    if (status === 'all') return true;
    return entry.status === status;
  }

  function compareFn(sortBy, sortOrder) {
    return (a, b) => {
      let cmp = 0;
      if (sortBy === 'date') cmp = new Date(b.date) - new Date(a.date);
      else if (sortBy === 'title') cmp = (a.title || '').localeCompare(b.title || '');
      else if (sortBy === 'size') cmp = (b.size || 0) - (a.size || 0);
      else if (sortBy === 'provider') cmp = (a.provider || '').localeCompare(b.provider || '');
      return sortOrder === 'desc' ? cmp : -cmp;
    };
  }

  // Event listeners
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      activeFilters.search = searchInput.value.trim();
      apply();
    }, 200); // debounce 200ms
  });

  // Botões de período: data-period="24h"
  filterButtons.querySelectorAll('[data-period]').forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.querySelectorAll('[data-period]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilters.period = btn.dataset.period;
      apply();
    });
  });

  // Botões de status: data-status="completed"
  filterButtons.querySelectorAll('[data-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.querySelectorAll('[data-status]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilters.status = btn.dataset.status;
      apply();
    });
  });

  function destroy() {
    clearTimeout(debounceTimer);
  }

  return { setEntries, apply, destroy };
}
```

### Etapa 2 — Integração no panels.js

**Arquivo:** `electron/renderer/panels.js` (MODIFICAR)

```
1. Importar createHistoryFilters de ./history-filters.js

2. No createPanelsController, adicionar ao estado:
   let historyFilters = null;

3. No refreshHistoryPanel():
   const entries = list ou [];
   
   if (!historyFilters) {
     const container = document.getElementById('historyFilters');
     const searchInput = document.getElementById('historySearch');
     const filterButtons = document.getElementById('historyFilterButtons');
     
     historyFilters = createHistoryFilters({
       container, searchInput, filterButtons,
       onFiltered: (filtered) => {
         // Renderizar apenas as entradas filtradas
         listEl.innerHTML = '';
         if (filtered.length === 0) {
           emptyEl.hidden = false;
           emptyEl.textContent = 'Nenhum download encontrado. Tente ajustar os filtros.';
           return;
         }
         emptyEl.hidden = true;
         for (const entry of filtered) listEl.appendChild(renderHistoryItem(entry));
         summaryEl.textContent = `${filtered.length} de ${entries.length} registros`;
       }
     });
   }
   
   historyFilters.setEntries(entries);
   
   // O filtro já chama onFiltered automaticamente
```

### Etapa 3 — HTML (Controles de filtro)

**Arquivo:** `electron/index.html` (MODIFICAR)

Substituir o cabeçalho simples do histórico por:

```
<section id="view-history" class="view" hidden>
  <div class="view-header card">
    <div>
      <h2>Histórico</h2>
      <p class="hint-line" id="historySummary">Carregando histórico...</p>
    </div>
    <div class="view-actions">
      <button id="historyClearBtn" class="button button-ghost" type="button">Limpar histórico</button>
      <button id="historyRefreshBtn" class="button button-ghost" type="button">Atualizar</button>
    </div>
  </div>

  <div id="historyFilters" class="history-filters card">
    <div class="search-row">
      <input id="historySearch" class="search-input" placeholder="🔍 Buscar no histórico..." />
    </div>
    <div id="historyFilterButtons" class="filter-row">
      <div class="filter-group">
        <button data-period="all" class="chip active">📅 Todas</button>
        <button data-period="24h" class="chip">📅 Últimas 24h</button>
        <button data-period="7d" class="chip">📅 Última semana</button>
        <button data-period="30d" class="chip">📅 Último mês</button>
      </div>
      <div class="filter-group">
        <button data-status="all" class="chip active">📄 Todos</button>
        <button data-status="completed" class="chip">✅ Concluídos</button>
        <button data-status="failed" class="chip">❌ Falhos</button>
        <button data-status="cancelled" class="chip">🗑️ Cancelados</button>
      </div>
    </div>
  </div>

  <div id="historyList" class="queue-list"></div>
  <div id="historyEmpty" class="empty-state" hidden>Nenhum download registrado ainda.</div>
</section>
```

### Etapa 4 — CSS

**Arquivo:** `electron/styles.css` (MODIFICAR)

```
.history-filters { margin-bottom: 12px; }
.search-row { margin-bottom: 8px; }
.search-input {
  width: 100%; padding: 8px 12px; border: 1px solid var(--line);
  border-radius: 8px; background: var(--bg); color: var(--text); font-size: 14px;
}
.search-input:focus { border-color: var(--accent); outline: none; }
.filter-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.filter-group { display: flex; gap: 4px; flex-wrap: wrap; }
.chip {
  padding: 4px 12px; border-radius: 16px; border: 1px solid var(--line);
  background: transparent; color: var(--text); font-size: 12px; cursor: pointer;
  transition: all 0.15s;
}
.chip:hover { border-color: var(--accent); }
.chip.active { background: var(--accent); color: #000; border-color: var(--accent); }
```

---

## 3. Arquivos Afetados

| Arquivo | Ação |
|---------|------|
| `electron/renderer/history-filters.js` | **NOVO** |
| `electron/renderer/panels.js` | MODIFICAR |
| `electron/index.html` | MODIFICAR |
| `electron/styles.css` | MODIFICAR |

> ⚠️ Nenhuma mudança no core! Toda a filtragem é client-side.

---

## 4. Testes

| Teste | Procedimento | Resultado |
|-------|-------------|-----------|
| Busca por título | Digitar "curso" | Apenas entradas com "curso" no título |
| Busca case-insensitive | Digitar "CURSO" | Mesmo resultado |
| Filtro "Últimas 24h" | Clicar no chip | Apenas entradas de hoje |
| Filtro "Falhos" | Clicar no chip | Apenas entradas com status failed |
| Combinar busca + filtro | "curso" + "Falhos" | Interseção dos dois filtros |
| Chip ativo | Clicar em chip | Chip fica destacado |
| Resetar filtros | Clicar "Todas" + "Todos" | Lista completa de volta |
| Sem resultados | Buscar por "zzzzimpossivel" | "Nenhum download encontrado" |

---

## 5. Critérios de Conclusão

- [ ] Campo de busca com debounce de 200ms
- [ ] Filtros de período (24h, 7d, 30d)
- [ ] Filtros de status (completados, falhos, cancelados)
- [ ] Filtros acumulativos (buca + período + status)
- [ ] Chips com destaque visual do ativo
- [ ] Mensagem amigável quando sem resultados
- [ ] Ordenação padrão: mais recentes primeiro