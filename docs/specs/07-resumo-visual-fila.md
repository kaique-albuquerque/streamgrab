# Spec: Resumo Visual da Fila

> **ID:** SPEC-07  
> **Status:** Rascunho  
> **Prioridade:** Alta  
> **Impacto:** 🔥🔥🔥🔥  
> **Esforço:** Médio

---

## 1. Objetivo

Oferecer ao usuário uma visão geral clara e imediata do estado da fila de downloads, com métricas consolidadas (ativos, pendentes, concluídos, falhos, velocidade, ETA, espaço em disco) através de cards e indicadores visuais.

---

## 2. Comportamento Atual

- A aba "Fila" (`#view-queue`) mostra a lista de jobs com seus estados individuais.
- O resumo atual é apenas texto: `"2/3 ativos · 5 na fila · 3 concluidos"` (gerado em `refreshQueuePanel()` em `panels.js`).
- Não há indicadores visuais de velocidade, ETA, tamanho total, ou espaço em disco.

---

## 3. Comportamento Desejado

### 3.1. Dashboard de Resumo

Substituir o texto simples do `#queueSummary` por um **dashboard visual** no topo da aba "Fila":

```
┌─────────────────────────────────────────────────────────────────────┐
│  📊 FILA DE DOWNLOADS                                     [⏸️ Pausar] │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐│
│  │ ATIVOS   │  │ NA FILA  │  │ CONCLUÍDOS│  │ VELOCIDADE│  │ ETA      ││
│  │    3     │  │    5     │  │   12     │  │  24 MB/s  │  │  4 min   ││
│  │ ▲ 2 cpu  │  │          │  │          │  │           │  │          ││
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘│
│                                                                      │
│  ┌─────────────────────────────────────────────────────┐            │
│  │ 💾 Espaço em disco: 45.2 GB livres de 256 GB       │            │
│  │ ████████████████░░░░░░░░░░░░░░░░  18% usado        │            │
│  └─────────────────────────────────────────────────────┘            │
│                                                                      │
│  ┌─────────────────────────────────────────────────────┐            │
│  │ 📈 Progresso acumulado: 3.2 GB / 8.7 GB (37%)      │            │
│  │ ████████████████░░░░░░░░░░░░░░░░░░░░░░░░  37%      │            │
│  │ Cada barra = 1 download ativo                      │            │
│  │ [══█══] [███░] [░░░░]                              │            │
│  └─────────────────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2. Cards de Métricas

| Card | Dados | Fonte |
|------|-------|-------|
| 🟢 **Ativos** | Nº de downloads em andamento + detalhes "2 CPU / 1 mergindo" | `queueList()` |
| 🟡 **Na fila** | Nº de jobs aguardando vaga | `queueList()` |
| ✅ **Concluídos** | Total de concluídos nesta sessão | `queueList()` |
| ⚡ **Velocidade** | Soma da velocidade instantânea de todos os jobs ativos em MB/s | Evento `speed` do engine |
| ⏱ **ETA** | Tempo estimado para conclusão de todos os jobs ativos | Calculado `totalRestante / velocidade` |
| 💾 **Disco** | Espaço livre + total + barra de uso | `checkDiskSpace()` |
| 📈 **Progresso** | GB baixados / total + barras individuais | Evento `progress` |

### 3.3. Barras de Progresso Individuais

Para cada job ativo, uma mini-barra colorida:

```
[████████░░░░]  75%  aula10.mp4  1080p  18 MB/s
[██░░░░░░░░░░]  18%  aula11.mp4  720p   6 MB/s
```

### 3.4. Badge na Aba "Fila"

O badge `#queueBadge` (já existe) mostra o número de jobs não-terminais. Melhorar para mostrar também ativos:

```
Fila  3 ⚡
```

O badge fica colorido: verde se todos ativos, amarelo se pausado, vermelho se algum falhou.

### 3.5. Auto-Refresh

- O dashboard atualiza automaticamente a cada **2 segundos** enquanto houver jobs ativos.
- Quando todos os jobs estão terminados, o refresh para (economia de CPU).
- O usuário pode clicar em "Atualizar" para refresh manual.

---

## 4. APIs e Módulos

### IPC

Canais já existentes (nenhum novo necessário):
- `queue:list` → dados dos jobs
- `settings:get` → para `maxConcurrentDownloads`

### Renderer

- Modificar `refreshQueuePanel()` em `electron/renderer/panels.js` para renderizar os cards.
- Adicionar listeners para eventos `speed`, `eta`, `progress` (já emitidos pelo engine, canal `queue:event`).

### Core

- `checkDiskSpace()` já existe em `src/core/index.js`.
- O engine já emite `speed` e `eta` events.

---

## 5. Arquivos Modificados / Criados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `electron/renderer/queue-dashboard.js` | Novo | Lógica de renderização dos cards e métricas |
| `electron/renderer/panels.js` | Modificar | Integrar dashboard no refresh da fila |
| `electron/styles.css` | Modificar | Estilos dos cards, mini-barras, indicadores |
| `electron/index.html` | Modificar | Substituir #queueSummary pelo container do dashboard |

---

## 6. Estrutura do Novo Módulo `electron/renderer/queue-dashboard.js`

```js
export function createQueueDashboard({ container, api }) {
  let refreshTimer = null;
  let activeJobIds = new Set();

  function startAutoRefresh() {
    stopAutoRefresh();
    refreshTimer = setInterval(refresh, 2000);
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  async function refresh() {
    const data = await api.queueList();
    const settings = await api.settingsGet();
    const disk = await api.checkDiskSpace();

    const jobs = data.jobs || [];
    const active = jobs.filter(j => ['analyzing','preparing','downloading','merging'].includes(j.state));
    const queued = jobs.filter(j => j.state === 'queued');
    const completed = jobs.filter(j => j.state === 'completed');
    const failed = jobs.filter(j => j.state === 'failed');

    // Velocidade total
    const totalSpeed = active.reduce((sum, j) => sum + (j.metrics?.speed || 0), 0);

    // ETA
    const remainingBytes = active.reduce((sum, j) => sum + (j.meta?.totalBytes || 0) * (1 - (j.progress || 0) / 100), 0);
    const etaSeconds = totalSpeed > 0 ? remainingBytes / totalSpeed : 0;

    renderCards({ active, queued, completed, failed, totalSpeed, etaSeconds, disk, settings });
    renderProgressBars(active);

    if (active.length > 0) startAutoRefresh();
    else stopAutoRefresh();
  }

  function renderCards(metrics) { /* ... */ }
  function renderProgressBars(activeJobs) { /* ... */ }

  return { refresh, startAutoRefresh, stopAutoRefresh, destroy };
}
```

---

## 7. Tradução / i18n

Os labels dos cards devem usar o idioma atual do app (português como padrão):

| Português | English |
|-----------|---------|
| Ativos | Active |
| Na fila | Queued |
| Concluídos | Completed |
| Velocidade | Speed |
| Espaço em disco | Disk space |

---

## 8. Testes

- 3 jobs ativos → cards mostram "3 ativos", velocidade somada, ETA calculado.
- Nenhum job → cards zerados.
- 1 job falhou → badge da fila fica vermelho.
- Todas as barras de progresso individuais funcionam.
- Auto-refresh liga/desliga corretamente.
- Espaço em disco é exibido corretamente.