# Spec: Pesquisa e Filtros no Histórico

> **ID:** SPEC-04  
> **Status:** Rascunho  
> **Prioridade:** Média  
> **Impacto:** 🔥🔥  
> **Esforço:** Baixo

---

## 1. Objetivo

Permitir que o usuário encontre rapidamente downloads antigos no histórico através de busca textual e filtros, evitando a navegação manual em uma lista linear que pode crescer indefinidamente.

---

## 2. Comportamento Atual

- O histórico é uma lista linear ordenada por data de conclusão.
- Não há campo de busca nem filtros.
- Em `electron/renderer/panels.js`, o método `refreshHistoryPanel()` apenas lista todas as entradas com `renderHistoryItem()`.

---

## 3. Comportamento Desejado

### 3.1. Barra de Pesquisa

Uma barra de busca no topo da aba "Histórico":

```
┌─────────────────────────────────────────────────────────┐
│  🔍 [Buscar no histórico...______________________]      │
│                                                        │
│  [📅 Últimas 24h] [📅 Última semana] [📅 Último mês]  │
│  [📄 Todos] [✅ Concluídos] [❌ Falhos] [🗑️ Cancelados] │
└─────────────────────────────────────────────────────────┘
```

- A busca é feita **do lado do cliente** (no JavaScript) sobre as entradas já carregadas do `history.json`.
- Filtra por: título, URL, formato, provedor.
- Case-insensitive.

### 3.2. Filtros de Período

| Filtro | Descrição |
|--------|-----------|
| Todas | Mostra todo o histórico |
| Últimas 24h | Entradas das últimas 24 horas |
| Última semana | Entradas dos últimos 7 dias |
| Último mês | Entradas dos últimos 30 dias |
| Personalizado | Input de data inicial e final (extra) |

### 3.3. Filtros de Status

| Filtro | Descrição |
|--------|-----------|
| Todos | Qualquer status |
| Concluídos | `status === 'completed'` |
| Falhos | `status === 'failed'` |
| Cancelados | `status === 'cancelled'` |

### 3.4. Ordenação

- Padrão: mais recentes primeiro.
- Opção de ordenar por: **Data**, **Título (A-Z)**, **Tamanho**, **Provedor**.
- Botão toggle para ascendente/descendente.

### 3.5. Comportamento

- Enquanto o usuário digita na busca, a lista filtra em tempo real (debounce de 200ms).
- Filtros acumulam: busca + período + status funcionam em conjunto.
- Se nenhum resultado corresponde, exibir mensagem amigável:

```
Nenhum download encontrado. Tente ajustar os filtros ou a busca.
```

---

## 4. APIs e Módulos

### Renderer

- Toda a lógica de filtro é client-side no `panels.js`.
- As entradas são carregadas via `window.api.historyList()` (já existe).
- Os filtros operam sobre o array em memória — sem mudanças no core.

### Novo módulo: `electron/renderer/history-filters.js`

```js
export function createHistoryFilters({ container, entries, onFiltered }) {
  // Renderiza os controles de busca e filtros
  // Aplica filtros sobre o array entries
  // Chama onFiltered(entriesFiltradas) a cada mudança
}
```

### Core

- Nenhuma alteração no `src/core/history.js`.
- Bônus: se o histórico for muito grande (>1000 entradas), o core pode aceitar um parâmetro `search` no `historyList()` para filtrar no servidor também.

---

## 5. Arquivos Modificados / Criados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `electron/renderer/history-filters.js` | Novo | Lógica de busca e filtros |
| `electron/renderer/panels.js` | Modificar | Integrar filtros no `refreshHistoryPanel()` |
| `electron/styles.css` | Modificar | Estilos da barra de busca, chips de filtro |
| `electron/index.html` | Modificar | Adicionar container de filtros no `#view-history` |

---

## 6. UX dos Filtros

### Chips de Filtro Ativos

Mostrar chips indicando filtros ativos, com botão "×" para remover individualmente:

```
[🔍 "curso" ×] [📅 Última semana ×] [✅ Concluídos ×]  [Limpar todos]
```

### Performance

- Para históricos com <10.000 entradas, filtragem 100% client-side.
- Para >10.000, considerar lazy loading com scroll infinito (25 entradas por load).

---

## 7. Estrutura de Dados

A filtragem opera sobre as entradas do `historyList()`:

```js
{
  id: "hist-42",
  title: "Curso de JavaScript - Aula 10",
  url: "https://...",
  provider: "youtube",
  format: "mp4",
  destination: "/Downloads/curso-js-aula10.mp4",
  status: "completed",
  size: 524288000,
  durationMs: 3600000,
  date: "2026-09-10T14:30:00.000Z"
}
```

### Função de Filtro

```js
function applyFilters(entries, { search, period, status, sortBy, sortOrder }) {
  return entries
    .filter(e => matchesSearch(e, search))
    .filter(e => matchesPeriod(e, period))
    .filter(e => matchesStatus(e, status))
    .sort(sortFn(sortBy, sortOrder));
}
```

---

## 8. Testes

- Buscar por "curso" → retorna entradas com "Curso" no título.
- Filtrar "Últimas 24h" → retorna entradas de hoje.
- Filtrar "Falhos" → retorna apenas entradas com status "failed".
- Combinar "curso" + "Falhos" → interseção dos dois filtros.
- Sem filtros → lista completa.
- Nenhum resultado → mensagem "Nenhum download encontrado".