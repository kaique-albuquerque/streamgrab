# Spec: Download em Lote — URLs Múltiplas

> **ID:** SPEC-03  
> **Status:** Rascunho  
> **Prioridade:** Alta  
> **Impacto:** 🔥🔥🔥🔥  
> **Esforço:** Médio

---

## 1. Objetivo

Permitir que o usuário adicione múltiplas URLs de uma só vez, evitando o trabalho repetitivo de criar uma aba para cada vídeo. O sistema enfileira todas as URLs automaticamente com as configurações padrão.

---

## 2. Comportamento Atual

- Cada URL exige uma aba separada.
- O usuário precisa colar, analisar e enfileirar cada URL manualmente.
- Não há campo para múltiplas URLs.

---

## 3. Comportamento Desejado

### 3.1. Modal "Download em Lote"

Um novo botão **"📦 Download em lote"** na barra superior, ao lado de "+ Nova aba". Ao clicar, abre uma modal com:

```
┌─────────────────────────────────────────────────┐
│  📦 Download em Lote                            │
│                                                 │
│  Cole as URLs (uma por linha):                  │
│  ┌─────────────────────────────────────────┐    │
│  │ https://youtube.com/watch?v=abc         │    │
│  │ https://example.com/video.m3u8          │    │
│  │ https://instagram.com/reel/xyz          │    │
│  │ https://...                             │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  ⚙️ Opções (aplicadas a todas):                 │
│  ┌─────────────────────────────────────────┐    │
│  │ Pasta: [Downloads________________] [Escolher] │
│  │ Turbo: [✓]     Smart: [✓]                     │
│  │ Qualidade: [melhor disponível ▼]              │
│  │ Áudio: [original ▼]                            │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  [Analisar e enfileirar (N URLs)]  [Cancelar]   │
└─────────────────────────────────────────────────┘
```

### 3.2. Fluxo

1. Usuário cola N URLs no textarea (separadas por linha, espaços ou vírgulas).
2. Opcionalmente define configurações comuns (pasta, turbo, qualidade, áudio).
3. Clica em **"Analisar e enfileirar"**.
4. O app processa cada URL em sequência:
   - Valida a URL (formato, protocolo).
   - Detecta o tipo (HLS, DASH, YouTube, Social, Direct).
   - Extrai metadados (título, duração, qualidades).
   - Gera nome de arquivo automaticamente (baseado no título).
   - Adiciona à fila com as opções selecionadas.
5. Feedback de progresso em tempo real:

```
┌─────────────────────────────────────────────────┐
│  📦 Processando URLs...                         │
│                                                 │
│  ✅ https://youtube.com/watch?v=abc  → Fila #1  │
│  ⏳ https://example.com/video.m3u8  → analisando │
│  ⏳ https://instagram.com/reel/xyz  → aguardando │
│  ❌ https://invalida.com           → URL inválida│
│                                                 │
│  [Fechar]   [Ver fila]                          │
└─────────────────────────────────────────────────┘
```

### 3.3. Tratamento de Erros

- URLs inválidas ou mal formatadas são ignoradas com aviso.
- URLs que falham na análise (timeout, 403, DRM) são marcadas como erro no resumo, mas não interrompem o processamento das demais.
- O usuário pode copiar a(s) URL(s) com erro para tentar manualmente depois.

### 3.4. Integração com a Fila Existente

- Cada URL vira um job na `DownloadQueue` (já existente em `src/core/queue.js`).
- O nome do arquivo é gerado via `resolveDesiredFilename()` + `sanitizeFilename()`.
- O progresso de cada job individual aparece na aba "Fila" normalmente.

### 3.5. CLI

Novo comando:

```bash
streamgrab batch < arquivo.txt
streamgrab batch --urls "url1,url2,url3" --output ./videos
```

Onde `arquivo.txt` contém uma URL por linha.

---

## 4. APIs e Módulos

### IPC (Novos Canais)

| Canal | Payload | Retorno |
|-------|---------|---------|
| `batch:enqueue` | `{ urls[], outputDir, options }` | `{ results: [{ url, jobId?, error? }] }` |
| `batch:progress` | evento contínuo | `{ url, status, jobId? }` |

### Renderer

- Novo módulo: `electron/renderer/batch-dialog.js`
- Lida com a abertura/fechamento do modal, parsing das URLs, exibição do progresso.

---

## 5. Arquivos Modificados / Criados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `electron/renderer/batch-dialog.js` | Novo | Modal de download em lote |
| `electron/renderer/renderer.js` | Modificar | Adicionar evento do botão |
| `electron/main.js` | Modificar | IPC handler `batch:enqueue` |
| `electron/preload.cjs` | Modificar | Expor `batchEnqueue` no `api` |
| `electron/styles.css` | Modificar | Estilos da modal e progresso |
| `electron/index.html` | Modificar | Template da modal batch |
| `src/batch.js` | Novo | Lógica central de batch (reutilizável CLI + Electron) |
| `bin/streamgrab.mjs` | Modificar | Comando `batch` |

---

## 6. Estrutura do Novo Módulo `src/batch.js`

```js
export async function processBatch({ urls, outputDir, options, onProgress, core, queue }) {
  const results = [];
  for (const url of urls) {
    try {
      onProgress?.({ url, status: 'analyzing' });
      // 1. Validar URL
      if (!isSafeHttpUrl(url)) throw new Error('URL inválida');
      // 2. Analisar
      const info = await core.analyze({ url });
      // 3. Gerar filename
      const filename = generateFilename(info, options);
      // 4. Enfileirar
      const jobId = queue.enqueue({ url, filename, outputDir, options });
      results.push({ url, jobId, status: 'ok' });
      onProgress?.({ url, status: 'enqueued', jobId });
    } catch (err) {
      results.push({ url, error: err.message, status: 'error' });
      onProgress?.({ url, status: 'error', error: err.message });
    }
  }
  return results;
}
```

## 7. Limites

- Máximo de 100 URLs por lote (evita travamento da UI).
- Processamento sequencial (1 URL por vez) para não sobrecarregar a CPU/rede.
- Timeout de 30s por análise de URL.

---

## 8. Testes

- 3 URLs válidas → todas enfileiradas com sucesso.
- 1 URL inválida + 2 válidas → 2 enfileiradas, 1 erro reportado.
- Arquivo.txt com 50 URLs → processa sem travamentos.
- Cancelar batch → URLs já enfileiradas permanecem na fila; resto é ignorado.