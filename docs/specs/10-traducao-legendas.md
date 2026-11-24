# Spec: Tradução Local de Legendas com LLM

> **ID:** SPEC-10
> **Status:** Rascunho aprovado para planejamento
> **Prioridade:** Média
> **Impacto:** 🔥🔥
> **Esforço:** Médio-Alto

---

## 1. Objetivo

Permitir que o usuário traduza um arquivo de legenda `.srt` em inglês para
português **100% localmente, sem chave de API e sem rede**, gerando uma legenda
que dê vontade de assistir — não uma tradução de manual.

**Caso de uso principal:** o usuário baixa um vídeo em inglês sem legenda, usa a
aba **Transcrever** para gerar `video.transcription.srt`, e depois clica em
**Traduzir para português** para assistir com legenda em PT.

**Não-objetivo:** gerar dublagem, traduzir `.txt`/`.md`, traduzir durante o
download, ou oferecer tradução para idiomas que não sejam PT nesta primeira
versão (o catálogo é extensível, a UI expõe apenas PT).

---

## 2. Comportamento Atual

- A transcrição gera `.txt`, `.md` e `.srt` a partir do áudio, com o idioma do
  **áudio** selecionado em [transcribe.html](../../electron/templates/transcribe.html).
  Esse seletor alimenta `-l` do whisper.cpp; não é idioma de destino.
- O whisper.cpp só traduz "qualquer idioma → inglês" (`--translate`), que o app
  não usa. Não existe tradução EN→PT no pipeline atual.
- O app não tem cliente HTTP para LLM, nem campo de API key, e não há nenhuma
  dependência de inferência além do whisper.
- O padrão de distribuição já resolve o problema difícil: binário empacotado em
  `extraResources/bin` + modelo grande baixado sob demanda para `userData`
  ([model-manager.js](../../src/transcribe/model-manager.js)).
- A fila de transcrição ([job-manager.js](../../src/transcribe/job-manager.js))
  já oferece concorrência limitada, retry com backoff, cancelamento, persistência
  e recuperação de crash — tudo reaproveitável por composição.

---

## 3. Comportamento Desejado

### 3.1. Fluxo do usuário (Electron)

Na aba **Transcrever**, abaixo da lista de jobs, um card **Traduzir legendas**:

```
┌────────────────────────────────────────────────────┐
│ Traduzir legendas                                  │
│ Arquivo .srt em inglês → legenda em português      │
│                                                    │
│ Modelo: [ Qwen3-4B (2,4 GB) ▾ ]   [Baixar]         │
│ [ 🌐 Selecionar .srt e traduzir ]                  │
└────────────────────────────────────────────────────┘
```

- O botão abre o seletor de arquivo filtrado por `.srt`.
- Se o modelo escolhido não estiver baixado, o botão **Baixar** aparece com
  progresso (mesmo componente da lista de modelos Whisper).
- A tradução entra na **mesma lista de jobs** da aba, com o rótulo
  `Traduzindo` e o nome do arquivo de saída.

Tradução é uma ação **separada**, não um parâmetro do job de transcrição: serve
para qualquer `.srt`, inclusive os gerados semanas antes ou trazidos de fora.

### 3.2. Fluxo do usuário (CLI)

```
streamgrab translate video.transcription.srt
streamgrab translate video.transcription.srt --model qwen2.5-7b
```

Saída:

```
🌐 Traduzindo legendas: video.transcription.srt
   Modelo: Qwen3-4B-Instruct-2507 (Q4_K_M)
   Bloco 3/12 (25%) — 92 segmentos traduzidos
✅ Tradução salva:
   📝 video.transcription.pt.srt
   ⚠ 4 segmentos ficaram acima do alvo de leitura (ver log)
```

### 3.3. Arquivos gerados

Entrada `video.transcription.srt` → saída `video.transcription.pt.srt`, no
mesmo diretório. O arquivo de entrada **nunca** é modificado. Se a saída já
existir, ela é sobrescrita (a tradução é determinística para o mesmo modelo e
entrada, e o usuário pediu explicitamente).

Formato da saída: SRT válido, com **índices e timestamps copiados byte a byte**
do original. Só o texto muda.

### 3.4. Pipeline de tradução

```
.srt (EN)
   │
   ├─ 1. parse → segmentos { index, start, end, startMs, endMs, text }
   │
   ├─ 2. agrupar em blocos de 30 segmentos (contexto para o LLM)
   │
   ├─ 3. para cada bloco: prompt + JSON schema → llama-cli → { "12": "...", ... }
   │
   ├─ 4. medir caracteres/segundo de cada segmento traduzido
   │      alvo: ≤ 17 caracteres por segundo de duração
   │
   ├─ 5. segundo passe só nos segmentos acima do alvo (encurtamento)
   │
   └─ 6. reconstruir .srt preservando index/start/end originais
```

**Por que condensar em vez de traduzir fielmente:** português ocupa ~20% mais
caracteres que inglês. Legenda que cabe em duas linhas no original estoura o
tempo de leitura em PT. O objetivo declarado é **assistir**, então o LLM é
instruído a dizer a mesma coisa com menos caracteres quando necessário. O
segmento que ainda não couber depois do segundo passe é mantido (não truncado) e
registrado no log — o usuário vê quais linhas ficaram apertadas em vez de
descobrir assistindo.

**Por que não fundir segmentos vizinhos:** quebraria o mapeamento 1:1 com o SRT
original, impedindo comparação linha a linha, e um erro de sincronia ficaria
invisível (parece atraso de legenda, mas é fusão errada).

**Por que não traduzir frase a frase sem contexto:** é exatamente o "tradutês"
rígido que o usuário rejeitou. O bloco de 30 segmentos dá ao modelo contexto
suficiente para manter nomes, gírias e pronomes coerentes.

### 3.5. Modelos

| Modelo | Arquivo | Tamanho | Papel |
|--------|---------|---------|-------|
| `qwen3-4b` | `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` | 2,38 GB | **Padrão.** Arquivo único, ~2x mais rápido em CPU. |
| `qwen2.5-7b` | `Qwen2.5-7B-Instruct-Q4_K_M.gguf` | 4,46 GB | Opcional. Mais natural, ~2x mais lento. |

Ambos são verificados por SHA-256 e baixados com retomada (HTTP Range) pelo
mesmo mecanismo de `.part` do `model-manager`. Origem: Hugging Face
(`unsloth/Qwen3-4B-Instruct-2507-GGUF` e `bartowski/Qwen2.5-7B-Instruct-GGUF`).

**Hardware de referência:** i5-1235U, 12 threads, 15,6 GB RAM, sem GPU
dedicada. O 4B gera ~10-12 tokens/s em CPU; 1h de vídeo leva ~20-35 min de
tradução. O modelo carrega uma vez por job (~2,5 GB RSS), não por bloco.

### 3.6. Runtime: llama.cpp

Binário empacotado, exatamente como o `whisper-cli`:

- Release oficial `ggml-org/llama.cpp`, tag fixada no catálogo.
- Assets por plataforma: `win-cpu-x64.zip`, `macos-arm64.tar.gz`,
  `macos-x64.tar.gz`, `ubuntu-x64.tar.gz`.
- **O `llama-cli` é um stub fino**: depende de `llama-cli-impl`, `llama-common`,
  `llama`, `ggml`, `ggml-base`, `libomp` e das `ggml-cpu-*.dll` por
  microarquitetura. Todas as bibliotecas da pasta precisam ser copiadas no
  empacotamento, senão o processo falha com `STATUS_DLL_NOT_FOUND`.
- Saída estruturada via `-j/--json-schema`: o modelo é gramaticalmente impedido
  de devolver algo fora do formato pedido. Isso elimina a maior fonte de
  retrabalho de parsing.
- Processo por bloco seria caro (recarregaria 2,4 GB por bloco). O job usa
  `llama-server` local em `127.0.0.1` com porta efêmera, carrega o modelo uma
  vez e envia cada bloco por HTTP; ao final, encerra o processo.

### 3.7. Configurações

Novas chaves em `settings.json`:

```json
{
  "translateModel": "qwen3-4b",
  "translateCharsPerSecond": 17
}
```

| Chave | Tipo | Default | Descrição |
|-------|------|---------|-----------|
| `translateModel` | string | `qwen3-4b` | Modelo padrão da UI |
| `translateCharsPerSecond` | number | `17` | Alvo de leitura; acima disso o segmento entra no segundo passe |

O alvo é configurável porque um usuário que lê rápido pode preferir legenda mais
fiel; o default segue o padrão de legendagem para adultos.

---

## 4. Contrato das interfaces

### 4.1. API pública (`src/translate/index.js`)

```js
export function translateSubtitle(options) → Promise<TranslateResult>

// options: {
//   srtPath: string,            // arquivo .srt de entrada
//   targetLang?: 'pt',          // default 'pt'
//   model?: string,             // default 'qwen3-4b'
//   charsPerSecond?: number,    // default 17
//   signal?: AbortSignal,
//   onProgress?: ({ stage, percent, block, totalBlocks, segments }) => void,
//   onLog?: (line: string) => void,
// }

// TranslateResult: {
//   outputPath: string,         // <base>.pt.srt
//   segments: number,           // total traduzido
//   overTarget: number[],       // índices que continuaram acima do alvo
//   durationMs: number,
// }
```

### 4.2. Módulos internos

| Módulo | Responsabilidade |
|--------|------------------|
| `src/translate/model-manager/catalog.js` | Única fonte de verdade: nome do arquivo, tamanho, SHA-256, URL |
| `src/translate/model-manager/*` | Download, status, integridade, marker (mesmo contrato de `src/transcribe/model-manager`) |
| `src/translate/llama-cpp/detect.js` | Resolve binário: `LLAMA_CPP_PATH` → empacotado → `vendor/llama` → PATH |
| `src/translate/llama-cpp/server.js` | Sobe `llama-server`, espera `/health`, encerra com abort |
| `src/translate/llama-cpp/chat.js` | POST `/v1/chat/completions` com `response_format: json_schema` |
| `src/translate/srt/parse.js` | Parse SRT → segmentos (reusa semântica de `parseSrt`) |
| `src/translate/srt/build.js` | Segmentos → SRT preservando index/start/end originais |
| `src/translate/prompt/blocks.js` | Agrupa segmentos em blocos de 30 com sobreposição zero |
| `src/translate/prompt/schema.js` | JSON schema + system prompt + user prompt |
| `src/translate/prompt/measure.js` | caracteres/segundo por segmento |
| `src/translate/pipeline.js` | Orquestra bloco → LLM → segundo passe → arquivo |
| `src/translate/job-manager.js` | Fila própria (`translate-jobs.json`), mesmo contrato do de transcrição |

### 4.3. Canais IPC

| Canal | Sentido | Payload |
|-------|---------|---------|
| `translate:start` | renderer → main | `{ srtPath, model, targetLang }` |
| `translate:cancel` | renderer → main | `{ jobId }` |
| `translate:retry` | renderer → main | `{ jobId }` |
| `translate:remove` | renderer → main | `{ jobId }` |
| `translate:job-list` | renderer → main | — |
| `translate:models` | renderer → main | — |
| `translate:model-status` | renderer → main | `{ model }` |
| `translate:model-download` | renderer → main | `{ model }` |
| `translate:model-cancel` | renderer → main | — |
| `translate:model-delete` | renderer → main | `{ model }` |
| `translate:progress` | main → renderer | `{ jobId, stage, percent, block, totalBlocks }` |
| `translate:log` | main → renderer | `{ jobId, line }` |
| `translate:done` | main → renderer | `{ jobId, files, overTarget, ... }` |
| `translate:error` | main → renderer | `{ jobId, error, cancelled }` |
| `translate:job-updated` | main → renderer | snapshot do job |
| `translate:model-progress` | main → renderer | progresso do download |

Todos os payloads de entrada passam por validação em
`electron/security-payloads-translate.js` (mesmo padrão de
`security-payloads-transcribe.js`): caminho absoluto existente, `.srt`
obrigatório, modelo presente no catálogo, idioma em allowlist.

---

## 5. Segurança

- 100% local: o `llama-server` escuta **apenas** `127.0.0.1`, em porta efêmera
  escolhida pelo SO, com `--no-webui` e `--api-key` aleatório por sessão.
- O processo é encerrado no fim do job, no abort e no `dispose()` do manager.
- Nenhum conteúdo de legenda sai da máquina.
- Caminho de entrada validado contra traversal; só arquivos `.srt` regulares.
- Modelos verificados por SHA-256 e baixados apenas de Hugging Face.
- Prompt e conteúdo do usuário nunca são logados integralmente (logs mostram
  bloco e contagem, não texto).

---

## 6. Testes exigidos

| Teste | O que prova |
|-------|-------------|
| Parse + build preservam index/timestamps | `build(parse(srt))` é idêntico ao original quando o texto não muda |
| Segmento acima do alvo entra no segundo passe | `measure()` acima de 17 ch/s dispara nova chamada só para aquele índice |
| Segmento que não cabe é mantido e reportado | texto não é truncado; índice aparece em `overTarget` |
| Falha de um bloco não corrompe a saída | erro no meio do job não cria `.pt.srt` parcial |
| JSON inválido do modelo é rejeitado | resposta sem os índices pedidos gera erro claro, não SRT quebrado |
| SRT com blocos malformados | entradas inválidas são ignoradas sem derrubar o job |
| Catálogo igual ao SHA-256 real | hash do catálogo confere com o arquivo do Hugging Face |
| Detecção do binário | fallback `LLAMA_CPP_PATH` → empacotado → vendor → PATH |
| Payload IPC rejeita caminho inválido | extensão diferente de `.srt` e caminho inexistente são recusados |
| Abort no meio do job | processo `llama-server` é encerrado e nenhum arquivo parcial fica |

---

## 7. Critérios de conclusão

- [ ] `streamgrab translate <arquivo>.srt` gera `.pt.srt` com timestamps intactos
- [ ] Card "Traduzir legendas" na aba Transcrever enfileira o job
- [ ] Job aparece na lista com progresso por bloco e cancelar/retry funcionando
- [ ] Modelo `qwen3-4b` baixa pela UI com progresso, retomada e verificação
- [ ] `.pt.srt` abre corretamente em player (VLC/MPV) e sincroniza
- [ ] Segmentos acima do alvo são listados no log e em `overTarget`
- [ ] `npm test` e `npm run lint` passam
- [ ] `package-resources.mjs` empacota `llama-server` + bibliotecas
- [ ] Nenhum arquivo acima de ~150 linhas (regra do CONTRIBUTING)