# Plano de Implementação — Notificações Nativas do Sistema

> **Origem:** SPEC-05 — `docs/specs/05-notificacoes-nativas.md`
> **Prioridade:** Alta | **Esforço:** Baixo | **Riscos:** Baixos

---

## 1. Dependências

| Recurso | Onde obter |
|---------|------------|
| `Notification` (Electron API) | Já disponível no processo main |
| Eventos da fila: `complete`, `error`, `cancel` | Emitidos por `services.queue` / `DownloadEngine` |
| `settings.get('notifications')` | `src/core/settings.js` — já existe |
| `app.getPath('temp')` | Electron API — para ícone temporário |

---

## 2. Etapas de Implementação

### Etapa 1 — Gerenciador de Notificações

**Arquivo:** `electron/notifications.js` (NOVO)

```
export function createNotifier({ settings, getWindow, shell, openFile }) {
  const AGGREGATE_WINDOW_MS = 5000;
  let pending = [];
  let timer = null;

  // Recebe eventos da fila
  function onJobEvent(event, job) {
    // Verifica settings
    const config = settings.get('notifications');
    if (!config || config === false) return;
    if (config === true) config = { onComplete: true, onError: true, onlyWhenMinimized: false };

    if (event === 'complete' && config.onComplete !== false) {
      pending.push({ type: 'complete', job, time: Date.now() });
    } else if (event === 'error' && config.onError !== false) {
      pending.push({ type: 'error', job, time: Date.now() });
    } else {
      return; // ignora outros eventos
    }
    scheduleFlush();
  }

  function scheduleFlush() {
    if (timer) return;
    timer = setTimeout(flush, AGGREGATE_WINDOW_MS);
  }

  function flush() {
    timer = null;
    const events = pending.splice(0);
    if (events.length === 0) return;

    const win = getWindow();
    const onlyMinimized = settings.get('notifications')?.onlyWhenMinimized !== false;
    if (onlyMinimized && win && win.isFocused() && !win.isMinimized()) return;

    const completed = events.filter(e => e.type === 'complete');
    const failed = events.filter(e => e.type === 'error');

    if (completed.length > 0) showNotification(completed, 'complete');
    if (failed.length > 0) showNotification(failed, 'error');
  }

  function showNotification(events, type) {
    const isMultiple = events.length > 1;
    const title = type === 'complete'
      ? (isMultiple ? `✅ ${events.length} downloads concluídos` : '✅ Download concluído')
      : (isMultiple ? `❌ ${events.length} downloads falharam` : '❌ Falha no download');

    const names = events.slice(0, 3).map(e => e.job.meta?.filename || 'vídeo');
    let body = names.join(', ');
    if (events.length > 3) body += ` e mais ${events.length - 3}`;
    if (type === 'error') {
      const firstError = events[0]?.job?.error?.message;
      if (firstError) body += ` — ${firstError}`;
    }

    const n = new Notification(title, { body });
    n.onclick = () => {
      const win = getWindow();
      if (win) { win.focus(); if (win.isMinimized()) win.restore(); }
      if (type === 'complete' && events.length === 1 && events[0].job.meta?.output) {
        shell.openPath(events[0].job.meta.output);
      }
    };
    n.show();
  }

  return { onJobEvent, dispose: () => { if (timer) clearTimeout(timer); } };
}
```

### Etapa 2 — Conexão no services.js

**Arquivo:** `electron/services.js` (MODIFICAR)

```
1. Importar createNotifier de ./notifications.js

2. Na createElectronServices:
   const notifier = createNotifier({
     settings,
     getWindow: () => BrowserWindow.getAllWindows()[0] || null,
     shell: await import('electron').then(e => e.shell),
   });

3. Conectar eventos da fila ao notifier:
   // No onEvent callback, após persistência:
   if (PERSIST_EVENTS.has(event) || event === 'complete' || event === 'error') {
     notifier.onJobEvent(event, payload);
   }

4. Retornar notifier no objeto de retorno.
```

### Etapa 3 — Configurações (já existe, mas expandir)

**Arquivo:** `src/core/settings.js` (MODIFICAR)

```
Expandir o campo 'notifications' de boolean para aceitar objeto:
  DEFAULT_SETTINGS:
    notifications: { onComplete: true, onError: true, onBatchComplete: true, onlyWhenMinimized: true }

  SCHEMA:
    notifications: { type: 'json', clamp: null }

  coerce() já trata type: 'json' — aceita boolean ou objeto.
```

### Etapa 4 — UI das Configurações

**Arquivo:** `electron/index.html` (MODIFICAR)

Substituir o toggle simples por controles mais granulares:

```
<fieldset class="notifications-settings">
  <legend>Notificações do sistema</legend>
  <label class="toggle">
    <input data-setting="notifications-onComplete" type="checkbox" />
    <span>🔔 Ao concluir download</span>
  </label>
  <label class="toggle">
    <input data-setting="notifications-onError" type="checkbox" />
    <span>🔔 Ao falhar download</span>
  </label>
  <label class="toggle">
    <input data-setting="notifications-onlyWhenMinimized" type="checkbox" />
    <span>💡 Só quando minimizado</span>
  </label>
</fieldset>
```

### Etapa 5 — CSS

**Arquivo:** `electron/styles.css` (MODIFICAR)

```
.notifications-settings {
  border: 1px solid var(--line); border-radius: 8px; padding: 16px; margin-top: 12px;
}
.notifications-settings legend { font-weight: bold; padding: 0 8px; }
```

---

## 3. Arquivos Afetados

| Arquivo | Ação |
|---------|------|
| `electron/notifications.js` | **NOVO** |
| `electron/services.js` | MODIFICAR |
| `electron/main.js` | MODIFICAR (se necessário importar notifier) |
| `electron/index.html` | MODIFICAR |
| `electron/renderer/panels.js` | MODIFICAR (salvar settings de notificação aninhados) |
| `src/core/settings.js` | MODIFICAR (schema expandido) |
| `electron/styles.css` | MODIFICAR |

---

## 4. Testes

| Teste | Procedimento | Resultado |
|-------|-------------|-----------|
| Download concluído (minimizado) | Iniciar download, minimizar app | Notificação nativa aparece |
| Download concluído (em foco) | Iniciar download, app maximizado | Notificação NÃO aparece (se onlyWhenMinimized=true) |
| 3 downloads em 5s | Concluir 3 downloads em sequência | 1 notificação agregada "3 downloads concluídos" |
| Clique na notificação | Clicar na notificação | App foca + abre arquivo |
| Notificações desligadas | Desabilitar toggle | Nenhuma notificação |
| Download falhou | Causar erro 403 | Notificação de erro com a mensagem |

---

## 5. Critérios de Conclusão

- [ ] Notificação nativa ao concluir download (app minimizado)
- [ ] Agregação de múltiplos eventos em janela de 5s
- [ ] Clique na notificação → foca app
- [ ] Se único arquivo concluído → clique abre o arquivo
- [ ] Notificação de erro com mensagem do problema
- [ ] Configuração `onlyWhenMinimized` respeitada
- [ ] Opção de desabilitar completamente