# Plano de Implementação — Download em Lote (URLs Múltiplas)

> **Origem:** SPEC-03 — `docs/specs/03-download-em-lote.md`
> **Prioridade:** Alta | **Esforço:** Médio | **Riscos:** Moderados (performance)

---

## 1. Dependências

| Recurso | Onde obter |
|---------|------------|
| `services.queue.enqueue()` | `src/core/queue.js` — já existe |
| `isSafeHttpUrl()` | `electron/security.js` — já existe |
| `services.core.analyze()` | `src/core/registry.js` — via `StreamGrabCore` |
| `sanitizeFilename()` | `electron/renderer/shared.js` — já existe |
| `resolveDesiredFilename()` | `electron/renderer/shared.js` — já existe |

---

## 2. Etapas de Implementação

### Etapa 1 — Core: `src/batch.js`

**Arquivo:** `src/batch.js` (NOVO)

```
/**
 * Processa múltiplas URLs em lote.
 * Totalmente agnóstico de Electron — reutilizável pelo CLI.
 */
export async function processBatch({ urls, outputDir, options = {}, onProgress, core, queue }) {
  const MAX_URLS = 100;
  const TIMEOUT_MS = 30_000;

  if (!Array.isArray(urls) || urls.length === 0) {
    return { results: [], error: 'Nenhuma URL fornecida.' };
  }
  if (urls.length > MAX_URLS) {
    return { results: [], error: `Máximo de ${MAX_URLS} URLs por lote.` };
  }

  const results = [];

  for (const rawUrl of urls) {
    const url = String(rawUrl).trim();
    const result = { url, status: 'pending', jobId: null, error: null };

    try {
      onProgress?.({ url, status: 'analyzing' });
      
      // 1. Validar URL
      if (!/^https?:\/\//i.test(url)) throw new Error('URL inválida');
      
      // 2. Analisar
      const info = await withTimeout(core.analyze({ url }), TMEOUT_MS);
      
      // 3. Gear nome do arquivo
      const titl = info?.media?.title || info?.title || 'video';
      const baseName = sanizieFilename(tite);
      const filename = ensureExtensin(aseName, '.mp4');
      
      //. Enfileirr
      const job = queue.enqueue(url, {
        title: info?.media?.title || '',
        meta: {
          destination: outputDir || '',
          filname,
          surceUrl: url,
        },
        ...options,
      });
      
      result.status = 'enqueued';
      result.jobId = job.id;
      onProgress?.({ url, status: 'enqueued', jobId: job.id, title: info?.media?.title });
      
    } catch (err) {
      result.status = 'error';
      result.error = err.message;
      onProgress?.({ url, status: 'error', error: err.message });
    }
    
    results.push(result);
  }
  
  return { results };
}

function sanitizeFilename(name) {
  return String(name).replace(/[<>:"/\\|?*]/g, '_').trim();
}

function ensureExtension(name, ext) {
  return name.toLowerCase().endsWith(ext) ? name : `${name}${ext}`;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout na análise')), ms)),
  ]);
}
```

### Etapa 2 — IPC: `batch:enqueue`

**Arquivo:** `electron/main.js` (MODIFICAR)

```
1. Importar processBatch de ../src/batch.js

2. Novo IPC handler:
   ipcMain.handle('batch:enqueue', async (_event, rawPayload) => {
     const { urls, outputDir, options } = rawPayload;
     if (!Array.isArray(urls)) return { results: [], error: 'urls deve ser um array' };
     
     const resultados = await processBatch({
       urls,
       outputDir,
       options,
       onProgress: (data) => {
         // Emite progresso para o renderer
         for (const win of BrowserWindow.getAllWindows()) {
           if (!win.isDestroyed()) {
             win.webContents.send('batch:progress', data);
           }
         }
       },
       core: services.core,
       queue: services.queue,
     });
     
     return resultados;
   });
```

### Etapa 3 — Preload

**Arquivo:** `electron/preload.cjs` (MODIFICAR)

```
  batchEnqueue: (payload) => ipcRenderer.invoke('batch:enqueue', payload),
  onBatchProgress: (cb) => ipcRenderer.on('batch:progress', (_e, data) => cb(data)),
```

### Etapa 4 — Modal "Download em Lote" (Renderer)

**Arquivo:** `electron/renderer/batch-dialog.js` (NOVO)

```
export function createBatchDialog({ dom, api, onViewQueue }) {

  function open() {
    // 1. Mostrar modal overlay
    // 2. Renderizar:
    //    - Textarea para URLs
    //    - Opções: pasta, turbo, qualidade, áudio
    //    - Botão [Analisar e enfileirar (N URLs)]
    // 3. Ao clicar no botão:
    //    a. Parsear URLs (split por \n, espaços, vírgulas)
    //    b. Validar formato
    //    c. Chamar api.batchEnqueue({ urls, outputDir, options })
    //    d. Mostrar progresso em tempo real via onBatchProgress
    //    e. Ao final, mostrar resumo: "X enfileirados, Y erros"
  }

  function close() { /* remover modal */ }

  return { open, close };
}
```

### Etapa 5 — Botão na Topbar

**Arquivo:** `electron/renderer/renderer.js` (MODIFICAR)

```
1. Importar createBatchDialog
2. No DOM, referenciar o botão: dom.batchBtn = document.getElementById('batchBtn')
3. Criar instância: const batchDialog = createBatchDialog({ dom, api: window.api, ... })
4. dom.batchBtn.addEventListener('click', () => batchDialog.open())
```

### Etapa 6 — HTML + CSS

**Arquivos:** `electron/index.html` + `electron/styles.css` (MODIFICAR)

```
HTML:
  - Botão na topbar: <button id="batchBtn" class="button button-ghost">📦 Download em lote</button>
  - Template da modal: <template id="batchTemplate"> ... </template>

CSS:
  .batch-modal { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; }
  .batch-modal-content { max-width: 640px; width: 100%; max-height: 80vh; overflow-y: auto; }
  .batch-textarea { width: 100%; min-height: 200px; font-family: monospace; }
  .batch-progress-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
  .batch-progress-item.success { color: var(--accent); }
  .batch-progress-item.error { color: var(--danger); }
```

### Etapa 7 — CLI

**Arquivo:** `bin/streamgrab.mjs` (MODIFICAR)

```
Adicionar comando 'batch':
  streamgrab batch < arquivo.txt
  streamgrab batch --urls "url1,url2"

Implementação:
  const fs = await import('fs');
  let urls;
  if (argv.urls) urls = argv.urls.split(/[,;]/);
  else if (pipInput) urls = fs.readFileSync('/dev/stdin', 'utf-8').split('\n');
  await processBatch({ urls, outputDir: argv.output, core, queue });
```

---

## 3. Arquivos Afetados

| Arquivo | Ação |
|---------|------|
| `src/batch.js` | **NOVO** |
| `electron/renderer/batch-dialog.js` | **NOVO** |
| `electron/main.js` | MODIFICAR |
| `electron/preload.cjs` | MODIFICAR |
| `electron/renderer/renderer.js` | MODIFICAR |
| `electron/index.html` | MODIFICAR |
| `electron/styles.css` | MODIFICAR |
| `bin/streamgrab.mjs` | MODIFICAR |

---

## 4. Testes

| Teste | Procedimento | Resultado |
|-------|-------------|-----------|
| 3 URLs válidas | Colar 3 URLs, clicar enfileirar | 3 jobs na fila |
| 1 inválida + 2 válidas | Colar mix | 2 enfileirados, 1 erro reportado |
| 101 URLs | Colar 101 URLs | Erro: máximo 100 |
| Campo vazio | Clicar sem URLs | Validação: "Nenhuma URL" |
| Cancelar lote | Fechar modal durante processamento | URLs já enfileiradas permanecem |
| CLI batch | `streamgrab batch < urls.txt` | Processa e exibe resumo |

---

## 5. Critérios de Conclusão

- [ ] Modal de batch com textarea e opções funcionando
- [ ] Progresso em tempo real por URL (analisando → enfileirado → erro)
- [ ] Opções comuns (pasta, turbo, qualidade) aplicadas a todas as URLs
- [ ] Limite de 100 URLs respeitado
- [ ] Erro em uma URL não interrompe as demais
- [ ] CLI `streamgrab batch` funcional
- [ ] Resumo final exibido