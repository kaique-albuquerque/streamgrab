# Plano de Implementação — Detecção Automática de URL

> **Origem:** SPEC-01 — `docs/specs/01-deteccao-automatica-url.md`
> **Prioridade:** Alta | **Esforço:** Baixo | **Riscos:** Mínimos

---

## 1. Dependências

| Recurso | Onde obter |
|---------|------------|
| `clipboard` (Electron API) | Já disponível no processo main |
| `detectSourceType()` | `src/utils.js` — já existe |
| `isSafeHttpUrl()` | `electron/security.js` — já existe |
| `getClipboardText()` | `src/utils.js` — já existe (usado no CLI) |

---

## 2. Etapas de Implementação

### Etapa 1 — Watcher no processo main

**Arquivo:** `electron/clipboard-watcher.js` (NOVO)

```
class ClipboardWatcher:
  - constructor({ intervalMs = 2000, settings })
  - start(): inicia polling via setInterval
  - stop(): pausa o watcher
  - setEnabled(bool): habilita/desabilita via settings
  - Evento: 'url-detected' com { url, sourceType }

Lógica do polling a cada 2s:
  1. clipboard.readText() (Electron API)
  2. Normalizar (trim, lowercase)
  3. Comparar com última URL conhecida (evitar duplicatas)
  4. Validar com isSafeHttpUrl()
  5. Chamar detectSourceType() → reconhecer padrões
  6. Se compatível → emitir evento para o renderer

Cooldown:
  - Map<url, timestamp> com 5 min de tolerância
  - Limpeza periódica do map (a cada 50 URLs registradas)
```

### Etapa 2 — IPC channel + Conexão no main

**Arquivo:** `electron/main.js` (MODIFICAR)

```
1. Importar ClipboardWatcher
2. No app.whenReady():
   - Instanciar watcher
   - Se settings.get('clipboardWatch') !== false → watcher.start()
3. Conectar eventos do watcher ao renderer via win.webContents.send('clipboard:url-detected', data)
4. Pausar watcher quando janela perder foco: win.on('blur', () => watcher.stop())
5. Retomar watcher quando janela ganhar foco: win.on('focus', () => watcher.start())
```

### Etapa 3 — Preload

**Arquivo:** `electron/preload.cjs` (MODIFICAR)

```
Adicionar ao contextBridge:
  onClipboardDetected: (cb) =>
    ipcRenderer.on('clipboard:url-detected', (_e, data) => cb(data))
```

### Etapa 4 — Renderer (UI do Toast)

**Arquivo:** `electron/renderer/clipboard-toast.js` (NOVO)

```
export function createClipboardToast({ onAnalyze, onIgnore, onFillOnly }):

  1. Criar elemento DOM do toast:
     <div class="clipboard-toast" role="alert">
       <div class="toast-content">
         <span class="toast-icon">🔗</span>
         <div class="toast-text">
           <strong>URL de vídeo detectada!</strong>
           <span class="toast-url">{url truncada}</span>
         </div>
       </div>
       <div class="toast-actions">
         <button class="button button-accent" data-action="analyze">Analisar</button>
         <button class="button button-primary" data-action="fill">Preencher campo</button>
         <button class="button button-ghost" data-action="ignore">Ignorar</button>
       </div>
     </div>

  2. Ações:
     - "Analisar" → preenche campo URL da aba ativa + chama analyzeTab()
     - "Preencher" → só preenche campo sem analisar
     - "Ignorar" → dismiss + cooldown de 5 min para aquela URL

  3. Animação: slide-in da direita (CSS transition 300ms)

  4. Auto-dismiss após 15 segundos se nenhuma ação
```

### Etapa 5 — Integração no renderer principal

**Arquivo:** `electron/renderer/renderer.js` (MODIFICAR)

```
1. Importar createClipboardToast
2. No appState, criar clipboardToast
3. window.api.onClipboardDetected(({ url, sourceType }) => {
     clipboardToast.show({ url, sourceType, activeTab: appState.activeTabId });
   })
```

### Etapa 6 — Estilos CSS

**Arquivo:** `electron/styles.css` (MODIFICAR)

```
.clipboard-toast {
  position: fixed; bottom: 24px; right: 24px; z-index: 1000;
  background: var(--panel); border: 1px solid var(--accent);
  border-radius: 12px; padding: 16px; min-width: 360px; max-width: 480px;
  box-shadow: var(--shadow);
  transform: translateX(120%); opacity: 0;
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.clipboard-toast.visible { transform: translateX(0); opacity: 1; }
.toast-content { display: flex; align-items: flex-start; gap: 12px; }
.toast-url { color: var(--muted); font-size: 13px; word-break: break-all; }
.toast-actions { display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end; }
```

### Etapa 7 — Configuração

**Arquivo:** `src/core/settings.js` (MODIFICAR)

```
Adicionar ao DEFAULT_SETTINGS:
  clipboardWatch: true  ← default: ligado

Adicionar ao SCHEMA:
  clipboardWatch: { type: 'boolean', clamp: null }
```

---

## 3. Arquivos Afetados (Resumo)

| Arquivo | Ação |
|---------|------|
| `electron/clipboard-watcher.js` | **NOVO** |
| `electron/main.js` | MODIFICAR |
| `electron/preload.cjs` | MODIFICAR |
| `electron/renderer/clipboard-toast.js` | **NOVO** |
| `electron/renderer/renderer.js` | MODIFICAR |
| `electron/renderer/app-state.js` | MODIFICAR |
| `electron/styles.css` | MODIFICAR |
| `src/core/settings.js` | MODIFICAR |

---

## 4. Testes

| Teste | Procedimento | Resultado Esperado |
|-------|-------------|-------------------|
| URL HLS na clipboard | Copiar `https://exemplo.com/video.m3u8` | Toast aparece após ~2s |
| URL aleatória | Copiar `https://exemplo.com/pagina` | Nenhum toast |
| Cooldown | Ignorar URL, copiar mesma URL de novo | Toast não reaparece (cooldown 5min) |
| "Analisar" | Clicar no botão Analisar | URL vai para a aba + análise inicia |
| "Preencher" | Clicar em Preencher campo | URL vai para a aba sem análise |
| Foco da janela | Minimizar app | Watcher pausa. Restaurar → retoma |
| Desabilitar | Settings → clipboardWatch = false | Toast nunca aparece |

---

## 5. Critérios de Conclusão

- [ ] Toast aparece ao detectar URL compatível na clipboard (~2s)
- [ ] Botão "Analisar" preenche URL na aba ativa e inicia análise
- [ ] Botão "Preencher campo" só preenche sem analisar
- [ ] "Ignorar" dismisse e ativa cooldown
- [ ] Coodown de 5 in impede dupicações
- [ ] Watcher pausa/retoma com fo da ja nela
- [ ] Opção de desativar nass Configurações funciona