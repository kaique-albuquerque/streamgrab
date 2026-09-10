# Spec: Detecção Automática de URL

> **ID:** SPEC-01  
> **Status:** Rascunho  
> **Prioridade:** Alta  
> **Impacto:** 🔥🔥🔥🔥  
> **Esforço:** Baixo

---

## 1. Objetivo

Reduzir o atrito de o usuário precisar colar manualmente a URL no campo de entrada. O app deve detectar automaticamente quando uma URL de mídia compatível está na área de transferência e oferecer ação imediata.

---

## 2. Comportamento Atual

- O usuário precisa copiar a URL manualmente (DevTools → Network → copiar) e colar no campo `input[data-field="url"]`.
- O método `getClipboardText()` já existe em `src/utils.js`, mas não é usado para detecção automática.
- Nenhum monitoramento da clipboard é feito.

---

## 3. Comportamento Desejado

### 3.1. Monitoramento da Clipboard (Electron)

- Um intervalo periódico (a cada ~2s) verifica o conteúdo da área de transferência.
- Quando uma URL compatível é detectada — contendo padrões como `.m3u8`, `.mpd`, `youtube.com/watch`, `youtu.be`, `instagram.com`, `facebook.com`, `tiktok.com`, etc. — o app exibe um badge/toast/notificação na interface.
- O usuário pode clicar no badge para preencher automaticamente o campo de URL da aba ativa e iniciar a análise.

### 3.2. Padrões Reconhecidos

```
- .m3u8                          → HLS
- .mpd                           → DASH
- youtube.com/watch              → YouTube
- youtu.be/                      → YouTube
- instagram.com/                 → Social
- facebook.com/                  → Social
- tiktok.com/                    → Social
- x.com/ ou twitter.com/         → Social
- Qualquer URL com extensão .mp4, .webm, .avi → Direct
```

### 3.3. UX

```
┌──────────────────────────────────────────────────┐
│  🔗 URL de vídeo detectada!                     │
│  youtube.com/watch?v=abc123                     │
│  [Analisar]  [Ignorar]  [Preencher só o campo]  │
└──────────────────────────────────────────────────┘
```

- O toast é não-intrusivo (slide-in) e desaparece após 15s se ignorado.
- O mesmo URL não é notificado novamente se já foi recentemente ignorado (cooldown de 5 min por URL).
- O usuário pode desabilitar a detecção automática nas Configurações.

### 3.4. CLI

No CLI, ao invés de detectar automaticamente (que seria intrusivo), exibir uma sugestão:

```
📋 URL detectada na clipboard: https://...
  Pressione Ctrl+V para colar ou Enter para aceitar.
```

---

## 4. APIs Envolvidas

### Electron (IPC)

- `clipboard.readText()` (Electron API) no `main.js` ou `services.js` via intervalo.
- Novo canal IPC: `clipboard:detected-url` → envia para o renderer.
- Renderer: handler em `app-state.js` ou novo módulo `clipboard-watcher.js`.

### Módulos Existentes

- `src/utils.js` → `getClipboardText()` (já existe, mas é para CLI)
- `detectSourceType()` em `src/utils.js` → reutilizar para identificar o tipo.

---

## 5. Novos Arquivos / Modificações

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `electron/clipboard-watcher.js` | Novo | Lógica de polling da clipboard + dedup |
| `electron/main.js` | Modificar | Iniciar watcher no `app.whenReady()` |
| `electron/preload.cjs` | Modificar | Expor `onClipboardUrl` no `api` |
| `electron/renderer/renderer.js` | Modificar | Inscrever-se no evento |
| `electron/renderer/app-state.js` | Modificar | Estado do toast/cooldown |
| `electron/styles.css` | Modificar | Estilos do toast |
| `electron/index.html` | Modificar | Template do toast |

---

## 6. Fluxo Técnico

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  clipboard  │────>│  clipboard-     │────>│  preload.cjs     │
│  (OS)       │     │  watcher.js     │     │  (contextBridge) │
└─────────────┘     │  (poll 2s)      │     └────────┬─────────┘
                    └─────────────────┘              │
                                             ┌───────▼────────┐
                                             │  renderer.js   │
                                             │  → showToast() │
                                             └────────────────┘
```

---

## 7. Segurança

- A clipboard é lida apenas no processo main (Electron). O renderer nunca acessa a clipboard diretamente.
- URLs detectadas são validadas por `isSafeHttpUrl()` em `electron/security.js`.
- O watch é pausado quando a janela não está focada (otimização de performance).

---

## 8. Testes

- Testar URL `.m3u8` na clipboard → toast aparece.
- Testar URL aleatória (sem padrão de mídia) → sem toast.
- Testar cooldown: mesma URL repetida → segundo toast não aparece.
- Testar foco: janela minimizada → watcher pausado.