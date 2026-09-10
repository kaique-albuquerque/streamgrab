# Spec: Preview de Mídia Antes do Download

> **ID:** SPEC-06  
> **Status:** Rascunho  
> **Prioridade:** Média  
> **Impacto:** 🔥🔥🔥  
> **Esforço:** Alto

---

## 1. Objetivo

Permitir que o usuário pré-visualize um trecho do vídeo antes de baixá-lo, confirmando que o conteúdo, qualidade e áudio correspondem ao esperado. Evita downloads desnecessários de URLs erradas ou qualidades inadequadas.

---

## 2. Comportamento Atual

- Após análise, o usuário vê apenas metadados textuais: título, duração, resolução, codecs, bitrate.
- Não há reprodução de vídeo — o usuário só descobre se é o conteúdo certo depois de baixar completamente.

---

## 3. Comportamento Desejado

### 3.1. Botão "Pré-visualizar"

Um novo botão **"▶ Pré-visualizar"** ao lado de "Baixar agora" e "Adicionar à fila", que aparece **após a análise** da URL.

```
[▶ Pré-visualizar]  [⬇ Baixar agora]  [➕ Adicionar à fila]
```

### 3.2. Preview Player

Ao clicar, abre um modal/overlay com um player de vídeo embutido:

```
┌────────────────────────────────────────────────────┐
│  ▶ Preview — Curso JavaScript - Aula 10           │
│  ┌──────────────────────────────────────────────┐  │
│  │                                              │  │
│  │              ▶  (player de vídeo)            │  │
│  │                                              │  │
│  │  ████████░░░░░░░░░░░░░░░░░░  15s / 60s      │  │
│  │  [▶/⏸] [🔊 ════] [⛶ Tela cheia]             │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  Qualidade: [1080p ▼]  Áudio: [Português ▼]       │
│                                                    │
│  [⬇ Baixar agora]  [Fechar]                        │
└────────────────────────────────────────────────────┘
```

### 3.3. Geração do Preview

**Estratégia:** Baixar apenas os primeiros ~5-10 MB ou ~60 segundos do vídeo (o que for menor) via FFmpeg, usando:

```bash
# Para HLS/DASH:
ffmpeg -i <url> -t 60 -c copy -f mp4 pipe:preview.mp4

# Para YouTube/social (via yt-dlp + ffmpeg):
yt-dlp --downloader ffmpeg -g <url> # pega a URL direta
ffmpeg -i <url_direta> -t 60 -c copy preview.mp4
```

**Alternativa mais leve:** Para arquivos diretos com suporte a Range requests, baixar apenas um segmento inicial (~5MB) usando o transporte Range já existente:

```js
const previewBuffer = await fetchRange(url, 0, 5 * 1024 * 1024);
// Salva como buffer temporário e alimenta o <video>
```

### 3.4. Player HTML5

Usar o elemento `<video>` nativo do HTML5 com `src` apontando para um blob:// ou file:// temporário.

```html
<video controls autoplay muted>
  <source src="blob:..." type="video/mp4">
</video>
```

### 3.5. Cache e Limpeza

- O preview é salvo em um diretório temporário (`app.getPath('temp')/streamgrab-preview/`).
- Após fechar o modal, o arquivo temporário é **excluído imediatamente**.
- Se o modal for reaberto para a mesma URL, reusa o cache (válido por 30 min).

### 3.6. Restrições

- Preview disponível apenas para fontes que suportam **segmentação rápida**: HLS, DASH, YouTube, arquivos diretos.
- Para fontes com DRM (Widevine, PlayReady), o preview é desabilitado com aviso: "DRM detectado — preview não disponível."
- Timeout de 30s para geração do preview.

---

## 4. APIs e Módulos

### IPC (Novos Canais)

| Canal | Payload | Retorno |
|-------|---------|---------|
| `preview:generate` | `{ url, quality, audio }` | `{ ok, tempPath, duration, mimeType }` |
| `preview:clear` | `{ tempPath }` | `{ ok }` |

### Core

- Nova função em `src/preview.js` — lógica de geração de preview independente de Electron.

```js
export async function generatePreview({ url, type, quality, ffmpegPath, tempDir }) {
  // 1. Verifica se é elegível para preview
  // 2. Baixa primeiros 60s / 10MB via FFmpeg
  // 3. Salva em tempDir
  // 4. Retorna { filePath, duration, mimeType }
}

export function clearPreview(filePath) {
  // Remove arquivo temporário
}
```

### Renderer

- Novo módulo: `electron/renderer/preview-player.js`

```js
export function createPreviewPlayer({ dom, api }) {
  function open(url, quality) { /* ... */ }
  function close() { /* ... limpa temp files ... */ }
  return { open, close };
}
```

---

## 5. Arquivos Modificados / Criados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `src/preview.js` | Novo | Lógica server-side de geração de preview |
| `electron/renderer/preview-player.js` | Novo | Modal com player de vídeo |
| `electron/main.js` | Modificar | IPC handlers `preview:generate` e `preview:clear` |
| `electron/preload.cjs` | Modificar | Expor `generatePreview` e `clearPreview` no `api` |
| `electron/renderer/video-tabs.js` | Modificar | Adicionar botão "Pré-visualizar" e handler |
| `electron/styles.css` | Modificar | Estilos do modal de preview e player |
| `electron/index.html` | Modificar | Template do modal de preview |

---

## 6. UX do Modal de Preview

```
Modal:
┌─────────────────────────────────────────────────┐
│  ▶ Preview — Nome do Vídeo              [✕]    │
├─────────────────────────────────────────────────┤
│                                                 │
│         ┌──────────────────────────┐            │
│         │                          │            │
│         │      ▶ REPRODUZINDO      │            │
│         │                          │            │
│         └──────────────────────────┘            │
│                                                 │
│   1080p ────●──────────────── 60s / ∞          │
│                                                 │
│   Qualidade: [1080p ▼]  Áudio: [Português ▼]   │
│                                                 │
│   [⬇ Baixar agora]  [⏳ Gerando preview...]    │
└─────────────────────────────────────────────────┘
```

---

## 7. Tratamento de Erros

| Erro | Mensagem |
|------|----------|
| Preview não suportado para esta fonte | "⚠️ Preview não disponível para este tipo de mídia." |
| Timeout na geração | "⏱️ O preview demorou muito para ser gerado. Tente baixar diretamente." |
| DRM detectado | "🔒 DRM detectado — preview não disponível." |
| URL expirada | "🔗 A URL expirou. Copie uma nova URL no DevTools." |

---

## 8. Testes

- URL HLS → preview de 60s gerado e reproduzido.
- URL YouTube → preview gerado via yt-dlp + ffmpeg.
- Fechar modal → arquivo temporário deletado.
- Preview não disponível para DRM → mensagem de aviso.
- Clicar "Baixar agora" dentro do modal → inicia download completo.