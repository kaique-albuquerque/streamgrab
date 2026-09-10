# Planos de Implementação — StreamGrab

> Este diretório contém os planos de execução detalhados para cada melhoria do StreamGrab. Cada plano deriva diretamente de uma **spec** em `docs/specs/` e detalha as etapas técnicas, arquivos, testes e critérios de conclusão.

---

## 📋 Lista de Planos

| # | Feature | Prioridade | Esforço | Status | Arquivo |
|---|---------|-----------|---------|--------|---------|
| 1 | 🔗 **Detecção automática de URL** | Alta | Baixo | ✅ Implementado | [`01-deteccao-automatica-url.md`](./01-deteccao-automatica-url.md) |
| 2 | 📖 **Tutorial interativo** | Alta | Baixo | ✅ Implementado | [`02-tutorial-interativo.md`](./02-tutorial-interativo.md) |
| 3 | 📦 **Download em lote (URLs múltiplas)** | Alta | Médio | ✅ Implementado | [`03-download-em-lote.md`](./03-download-em-lote.md) |
| 4 | 🔍 **Pesquisa e filtros no Histórico** | Média | Baixo | ✅ Implementado | [`04-pesquisa-historico.md`](./04-pesquisa-historico.md) |
| 5 | 🔔 **Notificações nativas do sistema** | Alta | Baixo | ✅ Implementado | [`05-notificacoes-nativas.md`](./05-notificacoes-nativas.md) |
| 6 | ▶️ **Preview de mídia antes do download** | Média | Alto | ✅ Implementado | [`06-preview-de-midia.md`](./06-preview-de-midia.md) |
| 7 | 📊 **Resumo visual da fila** | Alta | Médio | ✅ Implementado | [`07-resumo-visual-fila.md`](./07-resumo-visual-fila.md) |
| 8 | 📤 **Exportar lista de downloads** | Baixa | Baixo | ✅ Implementado | [`08-exportar-historico.md`](./08-exportar-historico.md) |

**Todas as 8 features foram implementadas.**

---

## 🚀 Fases de Implementação

```
Fase 1 (esforço baixo, impacto alto)  ✅ CONCLUÍDA
├── 01 - Detecção automática de URL      ✅
├── 05 - Notificações nativas            ✅
└── 02 - Tutorial interativo             ✅

Fase 2 (médio esforço)                ✅ CONCLUÍDA
├── 07 - Resumo visual da fila           ✅
└── 03 - Download em lote                ✅

Fase 3 (baixo esforço)                ✅ CONCLUÍDA
├── 04 - Pesquisa no histórico           ✅
└── 08 - Exportar histórico              ✅

Fase 4 (feature premium)              ✅ CONCLUÍDA
└── 06 - Preview de mídia                ✅
```

---

## 🧪 Estado dos Testes

- **Unitários:** 771/772 passando (1 falha preexistente em `update-ytdlp.test.js`, não relacionada)
- **Integração:** 17/17 passando
- **Lint:** 0 erros
- **Novos testes:** 87 adicionados
  - `tests/unit/batch.test.js` — 17
  - `tests/unit/history-filters.test.js` — 19
  - `tests/unit/history-export.test.js` — 12
  - `tests/unit/preview.test.js` — 18
  - `tests/unit/core-disk-atomic.test.js` — +2
  - `tests/unit/core-settings.test.js` — atualizado (13 chaves)

---

## 📦 Resumo dos Módulos Criados

| Módulo | Spec | Responsabilidade |
|--------|------|------------------|
| `electron/clipboard-watcher.js` | 01 | Polling da clipboard + cooldown |
| `electron/notifications.js` | 05 | Notificações nativas com agregação |
| `electron/renderer/clipboard-toast.js` | 01 | Toast de URL detectada |
| `electron/renderer/tutorial.js` | 02 | Tour + modais de ajuda |
| `electron/renderer/queue-dashboard.js` | 07 | Cards de métricas da fila |
| `electron/renderer/batch-dialog.js` | 03 | Modal de lote |
| `electron/renderer/history-filters.js` | 04 | Busca/filtros/ordenação |
| `electron/renderer/preview-player.js` | 06 | Player de preview |
| `src/batch.js` | 03 | Processamento de lote (puro) |
| `src/preview.js` | 06 | Geração de preview (puro) |
| `src/core/history-export.js` | 08 | Serialização CSV/JSON (puro) |

---

## 🔌 Novos Canais IPC

| Canal | Spec | Descrição |
|-------|------|-----------|
| `clipboard:ignore-url` | 01 | Adiciona URL ao cooldown |
| `clipboard:url-detected` | 01 | Evento: URL detectada |
| `app:disk-space` | 07 | Espaço em disco (free/total/used) |
| `app:open-external` | 02 | Abre URL http(s) no navegador |
| `batch:enqueue` | 03 | Processa lista de URLs |
| `batch:progress` | 03 | Evento: progresso por URL |
| `preview:generate` | 06 | Gera trecho de preview |
| `preview:clear` | 06 | Remove arquivo temporário |
| `history:export` | 08 | Exporta histórico CSV/JSON |

---

## ⚙️ Novas Configurações

| Chave | Default | Spec |
|-------|---------|------|
| `clipboardWatch` | `true` | 01 |
| `tutorialCompleted` | `false` | 02 |

---

## Estrutura de Cada Plano

Cada plano segue este formato:

```
1. Dependências       — Recursos pré-existentes que podem ser reutilizados
2. Etapas             — Passo a passo técnico com código de referência
3. Arquivos Afetados  — Lista de arquivos NOVOS e MODIFICADOS
4. Testes             — Tabela de casos de teste
5. Critérios          — Checklist de conclusão
```

> ⚠️ **Importante:** Nunca modificar `src/core/` de forma que comprometa a compatibilidade com CLI e Electron. Todos os novos módulos core devem ser puros (sem dependência de Electron).
>
> ⚠️ **Segurança:** Todo payload vindo do renderer deve ser validado por `electron/security.js` antes do processamento (seção 24 do architect.md).