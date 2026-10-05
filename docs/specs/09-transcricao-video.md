# Spec: Transcrição de Vídeo com Whisper

> **ID:** SPEC-09  
> **Status:** Rascunho  
> **Prioridade:** Média  
> **Impacto:** 🔥🔥🔥  
> **Esforço:** Médio

---

## 1. Objetivo

Permitir que o usuário gere uma **transcrição em texto puro** a partir do áudio de qualquer vídeo baixado pelo StreamGrab, para uso como material de estudo em ferramentas como **NotebookLM** (Google). O foco é gerar um `.txt`/`.md` limpo e bem formatado — **não** legendas embutidas no vídeo.

**Caso de uso principal:** O aluno baixa aulas do curso (Hotmart, YouTube, etc.), transcreve, e faz perguntas sobre a matéria no NotebookLM.

---

## 2. Comportamento Atual

- O StreamGrab baixa vídeos (HLS, DASH, YouTube, redes sociais) e opcionalmente baixa legendas já existentes na plataforma via yt-dlp (`--subs`).
- Não existe nenhuma funcionalidade de speech-to-text (transcrição de áudio).
- O FFmpeg já está integrado e consegue extrair áudio de qualquer vídeo.
- O yt-dlp já baixa legendas auto-geradas de YouTube (`--write-auto-sub`), mas isso só funciona para plataformas que oferecem ASR — não para HLS genérico, Hotmart, etc.

---

## 3. Comportamento Desejado

### 3.1. Transcrição via Whisper (local, gratuito)

Após o download de um vídeo, o usuário pode optar por transcrevê-lo com **duas opções de qualidade**:

**Opção rápida** (recomendada para uso geral):
```
streamgrab download <url> --transcribe
streamgrab download <url> --transcribe --transcribe-lang en
```

**Opção máxima** (qualidade superior, mais lenta):
```
streamgrab download <url> --transcribe --transcribe-quality max
streamgrab download <url> --transcribe --transcribe-quality max --transcribe-lang en
```

> **Fluxo de decisão do usuário:**
> ```
> 🎤 Qualidade da transcrição?
>    1. ⚡ Rápida (~15 min para 1h de vídeo) — qualidade boa
>    2. 🎯 Máxima (~25 min para 1h de vídeo) — qualidade superior
>    [1]
> ```

**Fluxo técnico:**
1. Extrair áudio do vídeo via FFmpeg → WAV 16kHz mono (formato ideal para Whisper)
2. Transcrever o áudio via Whisper (binário standalone ou `@xenova/transformers`)
3. Gerar arquivo de saída ao lado do vídeo:
   - `{nome}.transcription.txt` — texto puro (ideal para NotebookLM)
   - `{nome}.transcription.md` — texto com timestamps (opcional, para referência)
4. Limpar arquivo temporário de áudio

### 3.2. Engines de Transcrição (duas opções)

| Engine | Instalação | Velocidade | Tamanho | Dependência |
|--------|-----------|------------|---------|-------------|
| **whisper.cpp** (recomendado) | Script `install-whisper.mjs` (como FFmpeg) | ~2-3x tempo real | Binário ~15 MB + modelo ~769 MB | Nenhuma (standalone) |
| **@xenova/transformers** (fallback) | `npm install` | ~3-5x tempo real | ~800 MB (modelos em cache) | Nenhuma (Node.js puro) |

O Whisper.cpp é a opção principal por ser mais rápido e não depender de Python. O `@xenova/transformers` serve como fallback para ambientes onde o binário não pode ser compilado/instalado.

> **Nota sobre performance:** A opção máxima usa o modelo `medium` (~769 MB, ~5 GB RAM) que entrega **qualidade máxima sem GPU**. Para aulas longas (1-2h), a transcrição pode levar até 25 min. A opção rápida usa `small` (~244 MB, ~2 GB RAM) com tempo de ~15 min para 1h de vídeo.

### 3.3. Modelos Whisper

| Modelo | Tamanho | RAM | Tempo (1h vídeo) | Qualidade | Opção |
|--------|---------|-----|------------------|-----------|-------|
| `tiny` | 39 MB | ~1 GB | ~5 min | ⭐⭐ | — |
| `base` | 74 MB | ~1 GB | ~10 min | ⭐⭐⭐ | — |
| `small` | 244 MB | ~2 GB | ~15 min | ⭐⭐⭐⭐ | ⚡ **Rápida** (padrão) |
| `medium` | 769 MB | ~5 GB | ~25 min | ⭐⭐⭐⭐⭐ | 🎯 **Máxima** |

**Opções de transcrição:**

| Opção | Flag | Modelo | Tempo (1h) | Qualidade | Uso recomendado |
|-------|------|--------|------------|-----------|-----------------|
| ⚡ **Rápida** | `--transcribe` | `small` | ~15 min | ⭐⭐⭐⭐ | Uso geral, boa qualidade |
| 🎯 **Máxima** | `--transcribe --transcribe-quality max` | `medium` | ~25 min | ⭐⭐⭐⭐⭐ | NotebookLM, estudos |

> **Por que `small` como padrão?** A opção rápida usa o modelo `small` porque oferece **qualidade muito boa** com tempo razoável (~15 min para 1h). O usuário pode escolher `medium` quando precisa da máxima acurácia (ex: conteúdo técnico com terminologia específica).

> **Por que duas opções?**
> - **Rápida**: Para a maioria dos casos — 15 min é aceitável e a qualidade é excelente
> - **Máxima**: Para conteúdo crítico onde cada erro afeta a compreensão — vale o tempo extra

### 3.4. Formato de Saída

#### Arquivo `.txt` (padrão — para NotebookLM)

```text
Aula 12 - Funções e Escopos

Nesta aula vamos estudar funções em JavaScript. Uma função é um bloco de código
projetado para realizar uma tarefa particular. Ela pode ser declarada usando a
palavra-chave function, seguida de um nome, uma lista de parâmetros entre
parênteses e um bloco de código entre chaves...

Uma função pode retornar um valor usando a instrução return. Se nenhuma
instrução return for executada, a função retorna undefined por padrão...
```

#### Arquivo `.md` com timestamps (opcional)

```markdown
# Aula 12 - Funções e Escopos

**[00:00]** Nesta aula vamos estudar funções em JavaScript...
**[05:30]** Agora vamos ver escopos. O escopo determina...
**[12:45]** Exercício prático: crie uma função que...
```

### 3.5. UX — CLI

**Opção rápida (padrão):**
```
$ streamgrab download "https://hotmart.com/..." --transcribe

📥 Download: Aula 12 - Funções e Escopos
   ██████████████████████████████████ 100% | 45.2 MB

🎤 Transcrevendo áudio (opção rápida, idioma: pt)...
   Processando: 08:32 / 15:00
   ████████████████████░░░░░░░░░░░░ 57%

✅ Transcrição salva:
   📄 Aula 12 - Funcoes e Escopos.transcription.txt
   📝 Aula 12 - Funcoes e Escopos.transcription.md (com timestamps)
```

**Opção máxima:**
```
$ streamgrab download "https://hotmart.com/..." --transcribe --transcribe-quality max

📥 Download: Aula 12 - Funções e Escopos
   ██████████████████████████████████ 100% | 45.2 MB

🎤 Transcrevendo áudio (opção máxima, idioma: pt)...
   Processando: 12:45 / 25:00
   ████████████████████░░░░░░░░░░░░ 51%

✅ Transcrição salva:
   📄 Aula 12 - Funcoes e Escopos.transcription.txt
   📝 Aula 12 - Funcoes e Escopos.transcription.md (com timestamps)
```

### 3.6. UX — Electron

Na aba de análise, após o download completo, exibir um botão:

```
┌──────────────────────────────────────────────┐
│  ✅ Download concluído!                      │
│  Aula 12 - Funções e Escopos.mp4            │
│                                              │
│  [🎤 Transcrever para estudo]               │
└──────────────────────────────────────────────┘
```

Ao clicar:
- Exibe progresso da transcrição no painel de progresso
- Ao finalizar, oferece para abrir a pasta ou copiar o texto

### 3.7. Configurações

Novas chaves em `settings.json`:

```json
{
  "transcribe": false,
  "transcribeLang": "pt",
  "transcribeQuality": "fast",
  "transcribeTimestamps": true
}
```

| Chave | Tipo | Valores | Default | Descrição |
|-------|------|---------|---------|-----------|
| `transcribe` | boolean | `true/false` | `false` | Ativar transcrição pós-download |
| `transcribeLang` | string | `pt`, `en`, `es`, etc. | `pt` | Idioma da transcrição |
| `transcribeQuality` | string | `fast`, `max` | `fast` | Qualidade da transcrição |
| `transcribeTimestamps` | boolean | `true/false` | `true` | Gerar `.md` com timestamps |

**Mapeamento de qualidade:**

| `transcribeQuality` | Modelo | Tempo (1h) | RAM | Uso |
|---------------------|--------|------------|-----|-----|
| `fast` | `small` | ~15 min | ~2 GB | Padrão — bom equilíbrio |
| `max` | `medium` | ~25 min | ~5 GB | Máxima qualidade |

---

## 4. APIs Envolvidas

### FFmpeg (existente)

Extração de áudio do vídeo:
```
ffmpeg -i video.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 audio_temp.wav -y
```

### Whisper.cpp (novo)

**Opção rápida (small):**
```
whisper -m models/ggml-small.bin -f audio_temp.wav -l pt -osrt -t 4
```

**Opção máxima (medium):**
```
whisper -m models/ggml-medium.bin -f audio_temp.wav -l pt -osrt -t 4
```

Parâmetros:
- `-m` → caminho do modelo
- `-f` → arquivo de áudio (WAV 16kHz mono)
- `-l` → idioma (pt, en, es, etc.)
- `-osrt` → saída em SRT (para timestamps)
- `-t` → threads CPU

### @xenova/transformers (fallback)

**Opção rápida (small):**
```javascript
import { pipeline } from '@xenova/transformers';
const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small');
const result = await transcriber(audioPath, { language: 'pt', task: 'transcribe' });
```

**Opção máxima (medium):**
```javascript
import { pipeline } from '@xenova/transformers';
const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-medium');
const result = await transcriber(audioPath, { language: 'pt', task: 'transcribe' });
```

---

## 5. Novos Arquivos / Modificações

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `src/transcribe/index.js` | **Novo** | API pública: `transcribeVideo()`, `transcribeAudio()` |
| `src/transcribe/whisper-cpp.js` | **Novo** | Wrapper do whisper.cpp (subprocesso) |
| `src/transcribe/whisper-transformers.js` | **Novo** | Wrapper do @xenova/transformers (Node.js) |
| `src/transcribe/format.js` | **Novo** | Formatação: .txt puro, .md com timestamps, .srt |
| `src/transcribe/audio-extract.js` | **Novo** | Extração de áudio via FFmpeg (16kHz mono WAV) |
| `scripts/install-whisper.mjs` | **Novo** | Download do binário whisper.cpp + modelos small/medium |
| `Dockerfile` | Modificar | Adicionar whisper.cpp + modelos small/medium (~1 GB) |
| `docker-compose.yml` | Modificar | Aumentar memória para 6 GB |
| `src/core/engine/lifecycle.js` | Modificar | Adicionar `processTranscription()` pós-download |
| `src/core/engine/index.js` | Modificar | Passar flags de transcrição no `_runJob` |
| `src/core/settings.js` | Modificar | Adicionar chaves `transcribe*` |
| `src/cli/commands.js` | Modificar | Adicionar `--transcribe` ao help |
| `src/cli-flow/parse-flags.js` | Modificar | Parse das flags `--transcribe*` |
| `electron/renderer/video-tab-download.js` | Modificar | Botão "Transcrever" pós-download |
| `electron/ipc/queue-handlers.js` | Modificar | Aceitar opções de transcrição no enqueue |
| `package.json` | Modificar | Script `whisper:install` + keyword `transcription` |

---

## 6. Fluxo Técnico

```
┌──────────┐    ┌──────────┐    ┌────────────┐    ┌───────────┐    ┌──────────┐
│ Download │───>│ FFmpeg   │───>│ whisper.cpp│───>│ format.js │───>│ .txt/.md │
│ completo │    │ extrai   │    │ transcreve │    │ gera saida│    │ salvo    │
│          │    │ audio    │    │ audio      │    │           │    │ ao lado  │
└──────────┘    └──────────┘    └────────────┘    └───────────┘    └──────────┘
                  16kHz mono       modelo base       .txt puro        NotebookLM
                  WAV              + idioma           .md timestamps
```

---

## 7. Segurança

- Whisper.cpp é um binário standalone (sem acesso à rede após download do modelo).
- O modelo é verificado por checksum após download (SHA-256).
- Arquivos temporários de áudio são limpos após transcrição (não ficam no disco).
- Nenhum dado é enviado para servidores externos — tudo roda 100% local.
- O binário é baixado de fontes oficiais (ggerganov/whisper.cpp releases no GitHub).

---

## 8. Suporte Docker

O Docker precisa de ajustes para suportar os dois modelos de transcrição:

| Modelo | Tamanho | RAM | Tempo (1h) | Uso |
|--------|---------|-----|------------|-----|
| `small` | 244 MB | ~2 GB | ~15 min | ⚡ Rápida (padrão) |
| `medium` | 769 MB | ~5 GB | ~25 min | 🎯 Máxima |

### Dockerfile (modificações)

```dockerfile
FROM node:20-bookworm-slim

# Dependências do sistema (inclui python3 para compilação se necessário)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates ffmpeg python3 curl unzip \
  && ln -sf /usr/bin/python3 /usr/local/bin/python \
  && rm -rf /var/lib/apt/lists/*

# Instalar whisper.cpp (binário pré-compilado)
RUN mkdir -p /opt/whisper.cpp/models \
  && curl -L -o /tmp/whisper-cpp.zip \
    "https://github.com/ggerganov/whisper.cpp/releases/latest/download/main-build-x64.zip" \
  && unzip /tmp/whisper-cpp.zip -d /opt/whisper.cpp/ \
  && chmod +x /opt/whisper.cpp/main \
  && rm /tmp/whisper-cpp.zip

# Baixar modelo small (~244 MB) — opção rápida
RUN curl -L -o /opt/whisper.cpp/models/ggml-small.bin \
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"

# Baixar modelo medium (~769 MB) — opção máxima
RUN curl -L -o /opt/whisper.cpp/models/ggml-medium.bin \
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin"

WORKDIR /app

COPY package*.json ./
COPY scripts ./scripts
RUN FFMPEG_SKIP_DOWNLOAD=1 npm ci --omit=dev

COPY . .

RUN mkdir -p /downloads

ENV STREAMGRAB_DOWNLOAD_DIR=/downloads
ENV WHISPER_CPP_PATH=/opt/whisper.cpp/main
ENV WHISPER_MODEL_DIR=/opt/whisper.cpp/models

ENTRYPOINT ["node", "bin/streamgrab.mjs"]
```

**Impacto na imagem:**
- Imagem atual: ~200 MB (Node.js + FFmpeg)
- Imagem com Whisper: ~1.5 GB (adiciona binário ~15 MB + modelos ~1 GB)
- Primeiro build leva ~8-12 min (download dos modelos)

### docker-compose.yml (modificações)

```yaml
services:
  streamgrab:
    build: .
    image: streamgrab-cli:local
    environment:
      STREAMGRAB_DOWNLOAD_DIR: /downloads
      WHISPER_CPP_PATH: /opt/whisper.cpp/main
      WHISPER_MODEL_DIR: /opt/whisper.cpp/models
    volumes:
      - ./downloads:/downloads
      - ./vendor/whisper/models:/opt/whisper.cpp/models  # Cache dos modelos entre builds
    mem_limit: 6g          # Modelo medium precisa de ~5 GB RAM
    memswap_limit: 8g      # Permite swap para picos
    stdin_open: true
    tty: true
```

### Uso no Docker

```bash
# Build (uma vez, ~8-12 min)
docker-compose build

# Transcrever com opção rápida (padrão)
docker-compose run --rm streamgrab download "/downloads/aula12.mp4" --transcribe

# Transcrever com opção máxima
docker-compose run --rm streamgrab download "/downloads/aula12.mp4" --transcribe --transcribe-quality max

# Transcrever com idioma específico
docker-compose run --rm streamgrab download "/downloads/aula12.mp4" --transcribe --transcribe-lang en
```

### Variáveis de Ambiente

| Variável | Descrição | Default |
|----------|-----------|---------|
| `WHISPER_CPP_PATH` | Caminho do binário whisper.cpp | `vendor/whisper/main` (local) ou `/opt/whisper.cpp/main` (Docker) |
| `WHISPER_MODEL_DIR` | Diretório dos modelos GGML | `vendor/whisper/models` (local) ou `/opt/whisper.cpp/models` (Docker) |
| `WHISPER_MODEL` | Nome do modelo específico (override) | Auto (usa `small` para rápido, `medium` para máximo) |
| `WHISPER_THREADS` | Threads CPU para transcrição | `4` (auto no Docker) |

---

## 9. Testes

| Teste | Procedimento | Resultado Esperado |
|-------|-------------|-------------------|
| Transcrição rápida | `--transcribe` em vídeo PT de 1 min | `.txt` gerado com modelo `small` (~15s) |
| Transcrição máxima | `--transcribe --transcribe-quality max` em vídeo PT de 1 min | `.txt` gerado com modelo `medium` (~25s) |
| Idioma inglês | `--transcribe --transcribe-lang en` | Transcrição em inglês |
| Sem áudio | `--transcribe` em vídeo mudo | Mensagem de erro amigável |
| Arquivo grande (rápida) | Transcrever aula de 2h com opção rápida | Progresso atualizado, arquivo gerado (~15 min) |
| Arquivo grande (máxima) | Transcrever aula de 2h com opção máxima | Progresso atualizado, arquivo gerado (~25 min) |
| Docker build | `docker-compose build` | Imagem de ~1.5 GB criada com sucesso (2 modelos) |
| Docker transcribe (rápida) | `docker-compose run --rm streamgrab download "/downloads/aula.mp4" --transcribe` | Transcreve com `small` dentro do container |
| Docker transcribe (máxima) | `docker-compose run --rm streamgrab download "/downloads/aula.mp4" --transcribe --transcribe-quality max` | Transcreve com `medium` dentro do container |
| Docker RAM | Monitorar uso de RAM no Docker com modelo medium | Não excede 6 GB |
| Whisper não instalado | `--transcribe` sem whisper.cpp | Fallback ou erro com instrução de instalação |
| CLI help | `streamgrab help` | Mostra opção `--transcribe` e `--transcribe-quality` |
| Electron | Clicar "Transcrever" no UI | Escolha de qualidade exibida, progresso atualizado |
| Timestamps | Verificar `.md` gerado | Timestamps presentes e alinhados |
| Limpeza | Verificar pasta tmp pós-transcrição | Arquivo temporário de áudio removido |

---

## 10. Critérios de Conclusão

- [ ] `--transcribe` funciona no CLI e gera `.txt` com modelo `small` (rápida)
- [ ] `--transcribe --transcribe-quality max` gera `.txt` com modelo `medium` (máxima)
- [ ] `--transcribe-lang` permite escolher idioma (default: pt)
- [ ] Prompt de escolha de qualidade aparece no CLI interativo
- [ ] Whisper.cpp é baixado via `npm run whisper:install` (ambos os modelos)
- [ ] Fallback para `@xenova/transformers` quando whisper.cpp indisponível
- [ ] Extração de áudio limpa (16kHz mono WAV temporário)
- [ ] Arquivo temporário de áudio é removido após transcrição
- [ ] Dockerfile inclui whisper.cpp + modelos small/medium (~1.5 GB)
- [ ] docker-compose.yml tem `mem_limit: 6g` para suportar o modelo medium
- [ ] Variáveis de ambiente `WHISPER_CPP_PATH` e `WHISPER_MODEL_DIR` configuradas
- [ ] Botão "Transcrever" aparece no Electron pós-download
- [ ] Opções de qualidade exibidas no Electron (rápida/máxima)
- [ ] Progresso da transcrição é exibido (CLI e Electron)
- [ ] Testes unitários passam (transcribe/format, audio-extract)
- [ ] Testes de integração passam (pipeline completo)
- [ ] `npm run lint` sem erros
