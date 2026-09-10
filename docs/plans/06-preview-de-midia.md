# Plano de Implementação — Preview de Mídia Antes do Download

> **Origem:** SPEC-06 — `docs/specs/06-preview-de-midia.md`
> **Prioridade:** Média | **Esforço:** Alto | **Riscos:** Moderados (performance, FFmpeg)

---

## 1. Dependências

| Recurso | Onde obter |
|---------|------------|
| `ffmpeg` | `vendor/ffmpeg/` ou PATH — já integrado |
| `app.getPath('temp')` | Electron API |
| `friendlyReport()` | `src/core/errors.js` — já existe |
| `fetchRange()` | `src/transports/range.js` — já existe (para arquivos diretos) |
| `services.core.analyze()` | `src/core/registry.js` — já existe |

---

## 2. Etapas de Implementação

### Etapa 1 — Core: `src/preview.js`

**Arquivo:** `src/preview.js` (NOVO)

```
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PREVIEW_DURATION = 60;       // segundos
const PREVIEW_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const PREVIEW_TIMEOUT_MS = 30_000;

/**
 * Gera um preview de mídia.
 * @param {object} opts
 * @param {string} opts.url - URL da mídia
 * @param {'hls'|'dash'|'youtube'|'direct'} opts.sourceType
 * @param {string} opts.quality - URL da variante selecionada
 * @param {string} opts.ffmpegPath - Caminho do FFmpeg
 * @param {string} opts.tempDir - Diretório temporário
 * @returns {Promise<{ok: boolean, filePath?: string, durationMs?: number, mimeType?: string, error?: string}>}
 */
export async function generatePreview({ url, sourceType, quality, ffmpegPath, tempDir }) {
  const previewDir = path.join(tempDir, 'streamgrab-preview');
  fs.mkdirSync(previewDir, { recursive: true });

  const outputPath = path.join(previewDir, `preview-${Date.now()}.mp4`);
  const sourceUrl = quality || url;

  try {
    if (sourceType === 'direct') {
      // Para arquivos diretos: Range request dos primeiros 10MB
      await fetchRangePreview(sourceUrl, outputPath);
    } else {
      // Para HLS/DASH/YouTube: FFmpeg com -t 60
      await ffmpegPreview(sourceUrl, outputPath, ffmpegPath);
    }

    const stat = fs.statSync(outputPath);
    return {
      ok: true,
      filePath: outputPath,
      durationMs: PREVIEW_DURATION * 1000,
      mimeType: 'video/mp4',
      size: stat.size,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function ffmpegPreview(inputUrl, outputPath, ffmpegPath) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout na geração do preview')), PREVIEW_TIMEOUT_MS);
    const proc = spawn(ffmpegPath, [
      '-i', inputUrl,
      '-t', String(PREVIEW_DURATION),
      '-c', 'copy',
      '-y',           // sobrescrever
      '-f', 'mp4',
      outputPath,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exitou com código ${code}`));
    });
    proc.on('error', reject);
  });
}

function fetchRangePreview(url, outputPath) {
  // Usa o transporte Range existente para baixar apenas os primeiros bytes
  // TODO: importar fetchRange de transports/range.js
  return Promise.reject(new Error('Range preview não implementado'));
}

/**
 * Limpa um arquivo de preview.
 */
export function clearPreview(filePath) {
  try { fs.unlinkSync(filePath); } catch { /* ignora */ }
}

/**
 * Limpa todos os previews antigos (> 30 min).
 */
export function cleanOldPreviews(tempDir) {
  const previewDir = path.join(tempDir, 'streamgrab-preview');
  try {
    const now = Date.now();
    for (const file of fs.readdirSync(previewDir)) {
      const filePath = path.join(previewDir, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > 30 * 60 * 1000) fs.unlinkSync(filePath);
    }
  } catch { /* ignora */ }
}
```

### Etapa 2 — IPC Handlers

**Arquivo:** `electron/main.js` (MODIFICAR)

```
1. Importar { generatePreview, clearPreview, cleanOldPreviews } de ../src/preview.js

2. IPC: preview:generate
   ipcMain.handle('preview:generate', async (_event, rawPayload) => {
     const { url, sourceType, quality } = rawPayload;
     const ffmpegPath = services.settings.get('ffmpegPath') || 'ffmpeg';
     const tempDir = app.getPath('temp');
     
     // Validar se é elegível
     if (!['hls', 'dash', 'youtube', 'direct'].includes(sourceType)) {
       return { ok: false, error: 'Tipo de mídia não suportado para preview.' };
     }
     
     // Verificar cache (mesma URL nos últimos 30 min)
     const cacheKey = `${url}|${quality}`;
     if (previewCache.has(cacheKey)) {
       const cached = previewCache.get(cacheKey);
       if (Date.now() - cached.time < 30 * 60 * 1000 && fs.existsSync(cached.path)) {
         return { ok: true, filePath: cached.path, durationMs: 60000, mimeType: 'video/mp4', cached: true };
       }
     }
     
     const result = await generatePreview({ url, sourceType, quality, ffmpegPath, tempDir });
     if (result.ok) previewCache.set(cacheKey, { path: result.filePath, time: Date.now() });
     return result;
   });
   
   // Manter cache em memória
   const previewCache = new Map();

3. IPC: preview:clear
   ipcMain.handle('preview:clear', async (_event, { filePath }) => {
     clearPreview(filePath);
     return { ok: true };
   });

4. Agendar limpeza de previews antigos a cada 1h
   setInterval(() => cleanOldPreviews(app.getPath('temp')), 60 * 60 * 1000);
```

### Etapa 3 — Preload

**Arquivo:** `electron/preload.cjs` (MODIFICAR)

```
  generatePreview: (payload) => ipcRenderer.invoke('preview:generate', payload),
  clearPreview: (filePath) => ipcRenderer.invoke('preview:clear', { filePath }),
```

### Etapa 4 — Player (Renderer)

**Arquivo:** `electron/renderer/preview-player.js` (NOVO)

```
export function createPreviewPlayer({ api }) {
  let currentFilePath = null;
  let mediaSource = null;

  function open({ url, sourceType, quality, title, onDownload }) {
    // 1. Criar modal com <video> element
    // 2. Mostrar "Gerando preview..." com spinner
    // 3. Chamar api.generatePreview({ url, sourceType, quality })
    // 4. Se ok: definir src do <video> como file://path
    //     <video controls autoplay muted>
    //       <source src="file://${filePath}" type="video/mp4">
    //     </video>
    // 5. Se erro: mostrar mensagem com friendlyReport
    // 6. Botão [Baixar agora] dentro do modal → onDownload()
    // 7. Ao fechar: api.clearPreview(filePath)
  }

  function close() {
    if (currentFilePath) api.clearPreview(currentFilePath);
    currentFilePath = null;
    // remover modal
  }

  return { open, close };
}
```

### Etapa 5 — Botão "▶ Pré-visualizar"

**Arquivo:** `electron/renderer/video-tabs.js` (MODIFICAR)

```
1. Adicionar botão na action-row (após análise):
   <button data-action="preview" class="button button-ghost" type="button">▶ Pré-visualizar</button>

2. No wireTabEvents:
   fields.previewBtn.addEventListener('click', async () => {
     if (!state.media) { setStatus(state, 'Analise a URL primeiro.'); return; }
     previewPlayer.open({
       url: state.sourceUrl,
       sourceType: state.media.sourceType,
       quality: state.selectedQuality,
       title: state.media.title,
       onDownload: () => enqueueForTab(state, { lockNow: true }),
     });
   });

3. state.fields.previewBtn = panel.querySelector('[data-action="preview"]');
```

### Etapa 6 — CSS

**Arquivo:** `electron/styles.css` (MODIFICAR)

```
.preview-modal { position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.8); }
.preview-content {
  background: var(--panel); border-radius: 16px; padding: 24px;
  max-width: 800px; width: 90%; max-height: 90vh; overflow-y: auto;
}
.preview-video { width: 100%; max-height: 60vh; border-radius: 8px; background: #000; }
.preview-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.preview-actions { display: flex; gap: 8px; margin-top: 16px; justify-content: flex-end; }
.preview-spinner { text-align: center; padding: 48px; color: var(--muted); }
```

---

## 3. Arquivos Afetados

| Arquivo | Ação |
|---------|------|
| `src/preview.js` | **NOVO** |
| `electron/renderer/preview-player.js` | **NOVO** |
| `electron/main.js` | MODIFICAR |
| `electron/preload.cjs` | MODIFICAR |
| `electron/renderer/video-tabs.js` | MODIFICAR |
| `electron/index.html` | MODIFICAR |
| `electron/styles.css` | MODIFICAR |

---

## 4. Testes

| Teste | Procedimento | Resultado |
|-------|-------------|-----------|
| Preview HLS | Analisar URL HLS, clicar Pré-visualizar | Preview de 60s gera e reproduz |
| Preview YouTube | Analisar URL YouTube | Preview gerado via FFmpeg/short link |
| Cache | Preview mesma URL de novo | Preview instantâneo (cache) |
| Fechar preview | Clicar × | Arquivo temporário deletado |
| DRM | Fonte com DRM | "Preview não disponível" |
| Timeout | URL inválida/demorada | Mensagem de timeout |
| Baixar do preview | Clicar "Baixar" no modal | Inicia download completo |

---

## 5. Critérios de Conclusão

- [ ] Preview gera ~60s do vídeo via FFmpeg
- [ ] Player HTML5 reproduz o preview
- [ ] Cache de 30 min para mesma URL
- [ ] Preview não disponível para DRM
- [ ] Timeout de 30s na geração
- [ ] Arquivo temporário é limpo ao fechar
- [ ] Botão "Baixar agora" dentro do preview inicia download