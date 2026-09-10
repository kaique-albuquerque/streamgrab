# Plano de Implementação — Resumo Visual da Fila

> **Origem:** SPEC-07 — `docs/specs/07-resumo-visual-fila.md`
> **Prioridade:** Alta | **Esforço:** Médio | **Riscos:** Baixos

---

## 1. Dependências

| Recurso | Onde obter |
|---------|------------|
| `queue:list` IPC | `electron/main.js` — já existe |
| Eventos `speed`, `eta`, `progress` do engine | Já emitidos via `queue:event` |
| `checkDiskSpace()` | `src/core/disk.js` — já existe |
| `formatBytes()` | `electron/renderer/shared.js` — já existe |
| `formatDuration()` | `electron/renderer/shared.js` — já existe |

---

## 2. Etapas de Implementação

### Etapa 1 — Dashboard Module

**Arquivo:** `electron/renderer/queue-dashboard.js` (NOVO)

```
export function createQueueDashboard({ container, api, onEvent }) {
  let activeJobIds = new Set();
  let refreshTimer = null;
  let lastDiskCheck = 0;
  let cachedDisk = null;

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
    const jobs = data.jobs || [];

    const active = jobs.filter(j =>
      ['analyzing', 'preparing', 'downloading', 'merging'].includes(j.state));
    const queued = jobs.filter(j => j.state === 'queued');
    const completed = jobs.filter(j => j.state === 'completed');
    const failed = jobs.filter(j => j.state === 'failed');

    // Velocidade total (soma de todos os jobs ativos)
    const totalSpeedBps = active.reduce((sum, j) => {
      const speed = j.state === 'downloading' ? (j.metrics?.speed || 0) : 0;
      return sum + speed;
    }, 0);

    // Progresso acumulado
    const totalBytes = active.reduce((sum, j) => sum + (j.meta?.totalBytes || 0), 0);
    const downloadedBytes = active.reduce((sum, j) => {
      const progress = j.state === 'downloading' ? (j.progress || 0) / 100 : 0;
      return sum + Math.round((j.meta?.totalBytes || 0) * progress);
    }, 0);

    // ETA
    const remaining = totalBytes - downloadedBytes;
    const etaSeconds = totalSpeedBps > 0 ? remaining / totalSpeedBps : 0;

    // Espaço em disco (cache de 30s)
    if (Date.now() - lastDiskCheck > 30000) {
      try { cachedDisk = await api.checkDiskSpace(); } catch { /* ignora */ }
      lastDiskCheck = Date.now();
    }

    renderCards({ active, queued, completed, failed, totalSpeedBps, etaSeconds, cachedDisk });
    renderProgressBars(active, totalBytes, downloadedBytes);

    // Auto-refresh only when there are active jobs
    if (active.length > 0) startAutoRefresh();
    else stopAutoRefresh();
  }

  function renderCards({ active, queued, completed, failed, totalSpeedBps, etaSeconds, cachedDisk }) {
    container.innerHTML = `
      <div class="dashboard-grid">
        <div class="dash-card dash-card-active">
          <div class="dash-label">🟢 Ativos</div>
          <div class="dash-value">${active.length}</div>
          <div class="dash-sub">de ${queued.length + active.length} na fila</div>
        </div>
        <div class="dash-card dash-card-queue">
          <div class="dash-label">⏳ Na fila</div>
          <div class="dash-value">${queued.length}</div>
        </div>
        <div class="dash-card dash-card-done">
          <div class="dash-label">✅ Concluídos</div>
          <div class="dash-value">${completed.length}</div>
          ${failed.length > 0 ? `<div class="dash-sub error">${failed.length} falharam</div>` : ''}
        </div>
        <div class="dash-card dash-card-speed">
          <div class="dash-label">⚡ Velocidade</div>
          <div class="dash-value">${formatSpeed(totalSpeedBps)}</div>
        </div>
        <div class="dash-card dash-card-eta">
          <div class="dash-label">⏱ ETA</div>
          <div class="dash-value">${etaSeconds > 0 ? formatEta(etaSeconds) : '—'}</div>
        </div>
      </div>
      ${cachedDisk ? renderDiskCard(cachedDisk) : ''}
      ${active.length > 0 ? renderAccumulatedProgress(active, totalBytes, downloadedBytes) : ''}
    `;
  }

  function renderProgressBars(activeJobs, totalBytes, downloadedBytes) {
    // Each active job gets a mini progress bar
    if (activeJobs.length === 0) return;

    const barsHtml = activeJobs.map(job => {
      const pct = Math.min(100, Math.round(job.progress || 0));
      const filename = job.meta?.filename || 'video';
      const speed = job.state === 'downloading' ? formatSpeed(job.metrics?.speed || 0) : '';
      return `
        <div class="mini-job">
          <div class="mini-job-head">
            <span class="mini-job-name">${filename}</span>
            <span class="mini-job-pct">${pct}%</span>
            ${speed ? `<span class="mini-job-speed">${speed}</span>` : ''}
          </div>
          <div class="progress-bar mini"><span style="width:${pct}%"></span></div>
        </div>
      `;
    }).join('');

    // Append or update the progress section
    const progressSection = container.querySelector('.dashboard-progress') || document.createElement('div');
    progressSection.className = 'dashboard-progress';
    progressSection.innerHTML = `
      <div class="dash-label">📈 Progresso acumulado</div>
      <div class="acc-progress-info">${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)} (${totalBytes > 0 ? Math.round(downloadedBytes / totalBytes * 100) : 0}%)</div>
      ${barsHtml}
    `;
    container.appendChild(progressSection);
  }

  function formatSpeed(bps) {
    if (!bps || bps <= 0) return '—';
    if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} MB/s`;
    if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} KB/s`;
    return `${bps} B/s`;
  }

  function formatEta(seconds) {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}min ${Math.round(seconds % 60)}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return `${h}h ${m}min`;
  }

  function renderDiskCard(disk) {
    const free = disk.free ?? 0;
    const total = disk.total ?? 1;
    const usedPct = Math.round((1 - free / total) * 100);
    return `
      <div class="dash-card dash-card-disk">
        <div class="dash-label">💾 Espaço em disco</div>
        <div class="dash-sub">${formatBytes(free)} livres de ${formatBytes(total)}</div>
        <div class="progress-bar disk"><span style="width:${usedPct}%"></span></div>
      </div>
    `;
  }

  function destroy() {
    stopAutoRefresh();
    container.innerHTML = '';
  }

  return { refresh, startAutoRefresh, stopAutoRefresh, destroy };
}
```

### Etapa 2 — Integração no panels.js

**Arquivo:** `electron/renderer/panels.js` (MODIFICAR)

```
1. Importar createQueueDashboard de ./queue-dashboard.js

2. No createPanelsController, adicionar ao estado:
   let queueDashboard = null;

3. Modificar refreshQueuePanel():
   const dashboardContainer = document.getElementyId('queueDashboard');
   
   if (!queueDashboard) {
     queueDashboard = createQueueDashboard({
       container: dashboardContainer,
       api: window.api,
       onEvent: null,
     });
   }
   
   // Atualiza o dashboard + lista
   await queueDashboard.refresh();

4. Adicionar métrica de jobs ativos no badge e sumário (já existe, mas melhrar):
   if (adgeEl) {
     badgeEl.hidden = nonTerminal.length === 0;
     badgeEl.textContent = `${nonTerminal.length}`;
     // Adicionar cor baseada em staus
     if (jobs.sme(j => j.state=== 'failed')) badgeEl.style.background = 'var(--danger)';
     else if (atveCount > 0) badgeEl.style.background = 'var(--acent)';
     else badgeEl.style.background = '';
   }
```

### Etapa 3 — HTML

**Arquivo:** `electron/inde.html` (MODIFICAR)

```
<section id="view-queue" class="view" hidden"
  <div class="view-header card"
    <div>
      <h2>Fila de Downlods</h2>
      <p class="int-line" id="queueSummary">Carregando fila...</p>
    </div>
    <div class="view-actions"
      <button id="queueTogglePauseBtn" class="button button-ghost" type="button">Pausar fila</button>
      <button id="queueRfreshBtn" class="button button-ghost" type="button">Atualizar</button>
    </div>
  </div>

  <!-- Dashboard -->
  <div id="queueDasboard"></div>

  <div id="queueList" class="queue-list"></div>
  <div id="queueEmpty" class="empty-state" hidden>Nenhum download na fila.</div>
</section>
```

### Etapa 4 — CSS

**Arquivo:** `electro/style.css` (MODIFICAR)

```
.das-hboard   {  }
.dah-grid {
  dislay: grid; gid-template-columns: repeat(auto-fit, nimax(140px, 1fr)); gap: 12px;
  m argin-botom: 16px;
}
.dash-crd {
  background: var(--anel); border: 1px solid var(--line); border-radius: 12px;
  padding: 16px; text-align: center; min-width: 0;
}
.dash-abel { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
.das-value { font-size: 28px; font-weight: bold; }
.dash-sub { font-size: 12px; color: var(--muted); margin-top: 4px; }
.dash-sub.error { color: var(--danger); }
.dash-card-active .dash-value { color: var(--accent); }
.dash-card-done .dash-value { color: var(--accent-2); }
.dash-card-speed .dash-value { color: var(--warning); font-size: 20px; }
.dash-card-eta .dash-value { color: var(--accent-2); font-size: 20px; }

.mini-job { margin-bottom: 8px; }
.mini-job-head { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; margin-bottom: 4px; }
.mini-job-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mini-job-speed { color: var(--muted); }
.progress-bar.mini { height: 6px; border-radius: 3px; }
.progress-bar.disk { height: 8px; border-radius: 4px; margin-top: 8px; }
.progress-bar.mini span { backgound: var(--accent); }
.progress-bar.disk span { backgound: var(--warning); }
.dashboard-progress { margin-top: 12px; padding: 16px; border: 1px solid var(--line); border-radius: 12px; }
.acc-progress-info { font-size: 14px; color: var(--muted); margin-botom: 12px; }
```

---

## 3. Aquivos Afetados

| Arquito | Ação |
|---------|------|
| `eectron/renererer/queue-dashboard.js` | **NOVO** |
| `lectrn/renderer/anels.js` | MODIICAR |
| `eln/index.html` | MODIIFCAR |
| `lecon/styles.css` | MODIFICAR |

---

## 4. Testes

| Test | Resultado Espeado |
|-------|-----------------|
| 3 jobs tivos | 3 cards "Ativos", 0 "Na fila" |
| 2 jobs na fia | 2 cards "Na fila" |
| Velocidade sonda | Suma dos speed de odos os jobs tivos |
| ETA calculado | Tempo restate baseado n velocidade |
| Auto-refresh ativ | Atualiza a ada 2s quando houver jobs tivos|
| Auto-refresh deslig | Para qando todos s jobs ccluem |
| Esaço em diso | Carregdo e cachead a caa 30 |
| Badge colorido | Verde se tivo, vermlho se alhum falhou |

---

## 5. Citérios de Conclusão

- [ ]5 cards de méticas (ativos, na fila, concluídos, elocidade, ETA)
- [ ] Mini barra de progresso par cada job tivo
- [ ] Auto-refresh a cd 2s com jobs tivos
- [ ] Progresso acumulado (X GB / Y GB)
- [ ] Esoço em disco (livre/total) com barra
- [ ] Os cards pausa/retoma o auto-refresh corretamente
- [ ] Os 5 cards têm cores e ícones distintos