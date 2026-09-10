# Spec: Notificações Nativas do Sistema

> **ID:** SPEC-05  
> **Status:** Rascunho  
> **Prioridade:** Alta  
> **Impacto:** 🔥🔥🔥  
> **Esforço:** Baixo

---

## 1. Objetivo

Notificar o usuário quando um download é concluído (ou falha) mesmo com o aplicativo minimizado ou em segundo plano, utilizando as notificações nativas do sistema operacional.

---

## 2. Comportamento Atual

- A opção `notifications` existe nas Configurações (`electron/index.html` linha ~175).
- **Não há implementação real** — o toggle salva em `settings.json`, mas nenhum código lê essa config e dispara notificações.
- O usuário só vê o resultado se estiver olhando a interface (fila/histórico).

---

## 3. Comportamento Desejado

### 3.1. Gatilhos de Notificação

| Evento | Título | Corpo | Ação |
|--------|--------|-------|------|
| Download concluído | "✅ Download concluído" | `"Curso JavaScript - Aula 10.mp4"` | Clicar → abre o arquivo |
| Download concluído (múltiplos) | "✅ 3 downloads concluídos" | `"Curso JS, Python API, CSS Grid"` | Clicar → abre a pasta |
| Download falhou | "❌ Falha no download" | `"Curso JS — erro 403 (URL expirada)"` | Clicar → abre a aba |
| Lote concluído | "📦 Lote concluído" | `"5 de 6 downloads concluídos, 1 falhou"` | Clicar → abre a fila |

### 3.2. API de Notificação (Electron)

```js
const notification = new Notification({
  title: '✅ Download concluído',
  body: 'Curso JavaScript - Aula 10.mp4',
  icon: path.join(__dirname, '..', 'assets', 'icon.png'),
  silent: false,
  urgency: 'normal',
});

notification.onclick = () => {
  // Abre o arquivo ou a pasta
  shell.openPath(outputPath);
  // Foca a janela
  win.focus();
};

notification.show();
```

### 3.3. Configurações

Toggle existente em `settings.json` → `notifications`:

```json
{
  "notifications": true,
  "notifications": {
    "onComplete": true,
    "onError": true,
    "onBatchComplete": true,
    "sound": false,
    "onlyWhenMinimized": true
  }
}
```

### 3.4. Agregação (Batching de Notificações)

Em cenários de múltiplos downloads concluídos em sequência:
- Um timer de **5 segundos** agrega notificações.
- Se 3 downloads terminam em 5s, mostra **uma** notificação: "3 downloads concluídos".
- Os nomes dos arquivos são listados no corpo (limitado a 3 nomes + "e mais N").

### 3.5. Comportamento "Só quando minimizado"

- Se o app estiver em foco e maximizado, a notificação nativa **não** é disparada (evita duplicação com a UI).
- Se o app estiver minimizado ou em background, a notificação é enviada.
- Configurável via `onlyWhenMinimized`.

---

## 4. APIs e Módulos

### Electron — IPC

| Canal | Direção | Descrição |
|-------|---------|-----------|
| `notification:show` | Main → Renderer (evento) | Fallback para notificação in-app se o SO negar |
| — | — | A notificação é disparada **do processo main** (electron/main.js ou services.js), não do renderer |

### Modificações

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `electron/notifications.js` | Novo | Gerenciador de notificações com agregação |
| `electron/services.js` | Modificar | Conectar eventos da fila (`complete`, `error`, `cancel`) ao notificador |
| `electron/main.js` | Modificar | Registrar handler de clique na notificação |
| `src/core/settings.js` | Modificar | Garantir defaults de `notifications` |

---

## 5. Fluxo Técnico

```
DownloadQueue
  onEvent('complete', job) ──────────────────────────┐
  onEvent('error', job) ─────────────────────────────┤
                                                     ▼
                                            ┌──────────────────┐
                                            │  notifications.js │
                                            │                   │
                                            │  aggregateTimer   │
                                            │  (5s window)      │
                                            └────────┬─────────┘
                                                     │
                                                     ▼
                                            ┌──────────────────┐
                                            │  Notification    │
                                            │  (Electron API)  │
                                            │  n.show()        │
                                            └──────────────────┘
                                                     │
                                              usuário clica
                                                     │
                                                     ▼
                                            ┌──────────────────┐
                                            │  main.js         │
                                            │  → foca janela   │
                                            │  → abre arquivo  │
                                            └──────────────────┘
```

---

## 6. Estrutura do Novo Módulo `electron/notifications.js`

```js
const AGGREGATE_WINDOW_MS = 5000;

export function createNotifier({ settings, getWin, shell }) {
  const pending = [];
  let timer = null;

  function onJobEvent(event, job) {
    if (event === 'complete') {
      pending.push({ type: 'complete', job, time: Date.now() });
    } else if (event === 'error') {
      pending.push({ type: 'error', job, time: Date.now() });
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

    const completed = events.filter(e => e.type === 'complete');
    const failed = events.filter(e => e.type === 'error');

    const win = getWin();
    const shouldNotify = !settings.get('onlyWhenMinimized') ||
      !win || !win.isFocused();

    if (!shouldNotify) return;

    if (completed.length > 0) {
      showCompleteNotification(completed);
    }
    if (failed.length > 0) {
      showErrorNotification(failed);
    }
  }

  function showCompleteNotification(events) {
    const title = events.length === 1
      ? '✅ Download concluído'
      : `✅ ${events.length} downloads concluídos`;

    const names = events.map(e => e.job.meta?.filename || 'vídeo').slice(0, 3);
    const body = names.join(', ') + (events.length > 3 ? ` e mais ${events.length - 3}` : '');

    const n = new Notification(title, { body });
    n.onclick = () => {
      getWin()?.focus();
      if (events.length === 1 && events[0].job.meta?.output) {
        shell.openPath(events[0].job.meta.output);
      }
    };
    n.show();
  }

  function showErrorNotification(events) {
    const title = `❌ ${events.length} download(ns) falhou(ram)`;
    const body = events.map(e => e.job.meta?.filename || 'vídeo').join(', ');
    const n = new Notification(title, { body });
    n.onclick = () => getWin()?.focus();
    n.show();
  }

  return { onJobEvent };
}
```

---

## 7. Permissões

- No Windows 10+, a permissão de notificações é automática para apps Electron empacotados.
- No macOS, o sistema gerencia permissões; a primeira notificação pede autorização.
- No Linux, depende do ambiente desktop (notify-send / D-Bus).

---

## 8. Testes

- Download concluído com app minimizado → notificação aparece.
- Download concluído com app em foco → notificação não aparece (se `onlyWhenMinimized = true`).
- 3 downloads concluídos em 5s → 1 notificação agregada.
- Clicar na notificação → app foca + arquivo abre.
- `notifications: false` → nenhuma notificação é disparada.