# Plano de Implementação — Transcrição de Vídeo com Whisper

> **Origem:** SPEC-09 — `docs/specs/09-transcricao-video.md`
> **Prioridade:** Média | **Esforço:** Médio | **Riscos:** Baixos

---

## 1. Dependências

| Recurso | Onde obter | Status |
|---------|-----------|--------|
| FFmpeg (extração de áudio) | `src/ffmpeg/service.js` | ✅ Já existe |
| `binName()` / `getPackagedResourcesPath()` | `src/core/binaries.js` | ✅ Já existe |
| `spawn` (execução de processos) | `node:child_process` | ✅ Built-in |
| `FfmpegService` | `src/ffmpeg/service.js` | ✅ Já existe |
| whisper.cpp (binário) | `scripts/install-whisper.mjs` (novo) | ❌ Criar |
| Modelo GGML (small/medium) | Download via Hugging Face | ❌ Criar |

---

## 2. Etapas de Implementação

### Etapa 1 — Script de instalação do Whisper

**Arquivo:** `scripts/install-whisper.mjs` (NOVO)

```
Responsabilidade:
  - Detectar SO (win32/linux/darwin) e arquitetura (x64/arm64)
  - Baixar binário pré-compilado do whisper.cpp (releases do GitHub)
  - Baixar modelos GGML (small + medium) do Hugging Face
  - Verificar checksum SHA-256
  - Salvar em vendor/whisper/

Estrutura:
  vendor/whisper/
    main.exe              (ou 'main' no Linux/Mac)
    models/
      ggml-small.bin      (~244 MB)
      ggml-medium.bin     (~769 MB)
    .installed            (marker de instalação)

URLs de download:
  Binário:
    https://github.com/ggerganov/whisper.cpp/releases/latest/download/main-build-x64.zip
  Modelos:
    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin

Validação:
  - Verificar se binário existe e é executável
  - Verificar se modelos existem e têm tamanho correto
  - Criar arquivo .installed como marker
```

**package.json** (MODIFICAR):
```json
"whisper:install": "node scripts/install-whisper.mjs",
"postinstall": "node scripts/install-ffmpeg.mjs && node scripts/install-electron.mjs && node scripts/install-whisper.mjs"
```

---

### Etapa 2 — Extração de áudio

**Arquivo:** `src/transcribe/audio-extract.js` (NOVO)

```
Responsabilidade:
  - Extrair áudio do vídeo via FFmpeg
  - Formato: WAV 16kHz mono (ideal para Whisper)
  - Criar arquivo temporário em os.tmpdir()
  - Limpar arquivo temporário após uso

API:
  extractAudio({ videoPath, outputDir? }) → Promise<{ audioPath, cleanup }>

Comando FFmpeg:
  ffmpeg -i video.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 audio_temp.wav -y

Detalhes:
  - Usar FfmpegService existente para consistência
  - Arquivo temporário: {tmpdir}/sg-transcribe-{timestamp}.wav
  - cleanup(): remove o arquivo temporário
  - Tratar erros (vídeo sem áudio, FFmpeg não encontrado)
```

---

### Etapa 3 — Wrapper do Whisper.cpp

**Arquivo:** `src/transcribe/whisper-cpp.js` (NOVO)

```
Responsabilidade:
  - Detectar binário do whisper.cpp (vendor/whisper ou PATH)
  - Executar transcrição via subprocesso
  - Parsear progresso do stderr (tempo processado / total)
  - Retornar texto transcrito + timestamps

API:
  transcribeWithCpp({
    audioPath,
    language = 'pt',
    model = 'small',          // 'small' | 'medium'
    outputFormat = 'txt',     // 'txt' | 'srt' | 'vtt'
    threads = 4,
    signal,                   // AbortSignal
    onProgress,               // ({ elapsed, total, percent }) => void
    onLog,                    // (message) => void
  }) → Promise<{ text, segments[], outputPath }>

Comando:
  whisper -m {modelPath} -f {audioPath} -l {language} -o{format} -t {threads} --output-dir {tmpDir}

Parsing de progresso:
  - stderr contém linhas como: "progress: 00:15:22 / 00:48:15"
  - Converter para elapsed/total/percent
  - Emitir via onProgress a cada ~2s

Detalhes:
  - Caminho do binário: WHISPER_CPP_PATH env ou vendor/whisper/main[.exe]
  - Caminho do modelo: WHISPER_MODEL_DIR env ou vendor/whisper/models/
  - Mapear modelo: 'small' → ggml-small.bin, 'medium' → ggml-medium.bin
  - Suporte a AbortSignal (matar processo no cancelamento)
  - Timeout de segurança: 4x a duração do áudio (evitar loop infinito)
```

---

### Etapa 4 — Fallback @xenova/transformers

**Arquivo:** `src/transcribe/whisper-transformers.js` (NOVO)

```
Responsabilidade:
  - Fallback quando whisper.cpp não está disponível
  - Usar @xenova/transformers para transcrição em Node.js puro
  - Carregar modelo automaticamente na primeira execução

API:
  transcribeWithTransformers({
    audioPath,
    language = 'pt',
    model = 'small',
    signal,
    onProgress,
    onLog,
  }) → Promise<{ text, segments[] }>

Modelos:
  small: Xenova/whisper-small
  medium: Xenova/whisper-medium

Detalhes:
  - Importar dinamicamente: const { pipeline } = await import('@xenova/transformers')
  - Modelos são baixados em cache (~/.cache/transformers/)
  - onProgress baseado em chunks de áudio processados
  - Mais lento que whisper.cpp (~2-3x)
```

---

### Etapa 5 — Formatação de saída

**Arquivo:** `src/transcribe/format.js` (NOVO)

```
Responsabilidade:
  - Converter resultado do Whisper em arquivos de saída
  - Gerar .txt puro (para NotebookLM)
  - Gerar .md com timestamps (para referência)

API:
  formatTxt({ text, title }) → string
  formatMd({ segments, title }) → string
  writeTranscription({ outputPath, text, segments, title, formats }) → Promise<{ files[] }>

Formato .txt:
  {Título}\n\n{Texto corrido, parágrafos limpos}

Formato .md:
  # {Título}\n\n**[MM:SS]** {segmento}\n\n**[MM:SS]** {segmento}...

Detalhes:
  - Limpar artefatos de transcrição ([Música], [Risos], etc.)
  - Unir segmentos próximos em parágrafos coerentes
  - Formatar timestamps como [MM:SS] ou [HH:MM:SS]
  - Salvar ao lado do vídeo original
  - Nome: {nome_video}.transcription.txt / .md
```

---

### Etapa 6 — API pública do módulo

**Arquivo:** `src/transcribe/index.js` (NOVO)

```
Responsabilidade:
  - Orquestrar o fluxo completo: extração → transcrição → formatação
  - Detectar engine disponível (cpp vs transformers)
  - Gerenciar limpeza de temporários

API:
  transcribeVideo({
    videoPath,
    language = 'pt',
    quality = 'fast',        // 'fast' → small, 'max' → medium
    formats = ['txt', 'md'],
    signal,
    onProgress,
    onLog,
  }) → Promise<{ files[], engine, durationMs }>

  transcribeAudio({          // Para áudio já extraído
    audioPath,
    language = 'pt',
    quality = 'fast',
    formats = ['txt', 'md'],
    signal,
    onProgress,
    onLog,
  }) → Promise<{ files[], engine, durationMs }>

Mapeamento de qualidade:
  'fast' → model: 'small'
  'max'  → model: 'medium'

Fluxo interno:
  1. Detectar engine: tentar whisper.cpp → fallback transformers
  2. Extrair áudio (se videoPath fornecido)
  3. Transcrever
  4. Formatar saída
  5. Limpar temporários
  6. Retornar caminhos dos arquivos gerados
```

---

### Etapa 7 — Integração no DownloadEngine

**Arquivo:** `src/core/engine/lifecycle.js` (MODIFICAR)

```
Adicionar função processTranscription:
  export async function processTranscription(engine, job, {
    transcribe, transcribeQuality, transcribeLang, transcribeTimestamps
  }) {
    if (!transcribe || !job.meta?.output) return;
    if (!fs.existsSync(job.meta.output)) return;

    engine._emit('log', {
      jobId: job.id,
      message: `[transcribe] iniciando transcrição (opção: ${transcribeQuality || 'fast'})`
    });

    const result = await transcribeVideo({
      videoPath: job.meta.output,
      language: transcribeLang || 'pt',
      quality: transcribeQuality || 'fast',
      formats: transcribeTimestamps ? ['txt', 'md'] : ['txt'],
      signal: engine._active.get(job.id)?.attempt?.signal,
      onProgress: ({ percent }) => {
        engine._emit('progress', {
          jobId: job.id,
          stage: 'transcribing',
          percent,
          message: `Transcrevendo: ${percent}%`
        });
      },
      onLog: (msg) => engine._emit('log', { jobId: job.id, message: msg }),
    });

    engine._emit('log', {
      jobId: job.id,
      message: `[transcribe] ${result.files.length} arquivo(s) gerado(s) em ${result.durationMs}ms`
    });
  }
```

**Arquivo:** `src/core/engine/index.js` (MODIFICAR)

```
Em _runJob, adicionar após processSubtitles:

  await processTranscription(this, job, {
    transcribe: opts.transcribe,
    transcribeQuality: opts.transcribeQuality,
    transcribeLang: opts.transcribeLang,
    transcribeTimestamps: opts.transcribeTimestamps,
  });
```

---

### Etapa 8 — Configurações

**Arquivo:** `src/core/settings.js` (MODIFICAR)

```
Adicionar ao DEFAULT_SETTINGS:
  transcribe: false,
  transcribeLang: 'pt',
  transcribeQuality: 'fast',
  transcribeTimestamps: true,

Adicionar ao SCHEMA:
  transcribe: { type: 'boolean', clamp: null },
  transcribeLang: { type: 'string', clamp: null },
  transcribeQuality: { type: 'string', clamp: null },
  transcribeTimestamps: { type: 'boolean', clamp: null },
```

---

### Etapa 9 — CLI flags

**Arquivo:** `src/cli/commands.js` (MODIFICAR)

```
Em printSubcommandHelp, adicionar:

  io.log('  --transcribe                Transcrever apos download');
  io.log('  --transcribe-quality <q>    Qualidade: fast (padrao) ou max');
  io.log('  --transcribe-lang <code>    Idioma da transcricao (padrao: pt)');
  io.log('  --no-timestamps             Nao gerar .md com timestamps');
```

**Arquivo:** `src/cli-flow/parse-flags.js` (MODIFICAR)

```
Adicionar parsing:
  const transcribe = argv.includes('--transcribe');
  const transcribeIdx = argv.indexOf('--transcribe-quality');
  const transcribeQuality = transcribeIdx !== -1 ? (argv[transcribeIdx + 1] || 'fast') : 'fast';
  const transcribeLangIdx = argv.indexOf('--transcribe-lang');
  const transcribeLang = transcribeLangIdx !== -1 ? (argv[transcribeLangIdx + 1] || 'pt') : 'pt';
  const transcribeTimestamps = !argv.includes('--no-timestamps');

Incluir no retorno:
  transcribe, transcribeQuality, transcribeLang, transcribeTimestamps
```

---

### Etapa 10 — Electron UI

**Arquivo:** `electron/renderer/video-tab-download.js` (MODIFICAR)

```
Após download completo, exibir botão de transcrição:

  if (downloadComplete && !alreadyTranscribed) {
    renderTranscribeButton({
      onComplete: () => showTranscribeOptions(),
    });
  }

Opções de transcrição (modal/painel):
  ┌──────────────────────────────────────────────┐
  │  🎤 Transcrever para estudo                  │
  │                                              │
  │  Opção:                                      │
  │  ( ) ⚡ Rápida (~15 min para 1h de vídeo)   │
  │  ( ) 🎯 Máxima (~25 min para 1h de vídeo)   │
  │                                              │
  │  Idioma: [Português ▾]                       │
  │                                              │
  │     [Cancelar]  [Iniciar transcrição]        │
  └──────────────────────────────────────────────┘
```

**Arquivo:** `electron/ipc/queue-handlers.js` (MODIFICAR)

```
Adicionar opções de transcrição no enqueueDownload:
  transcribe, transcribeQuality, transcribeLang, transcribeTimestamps

Passar para o engine:
  engine.enqueue(url, {
    ...existingOptions,
    transcribe, transcribeQuality, transcribeLang, transcribeTimestamps,
  });
```

---

### Etapa 11 — Docker

**Arquivo:** `Dockerfile` (MODIFICAR)

```
Adicionar após instalação do FFmpeg:

  # Instalar whisper.cpp
  RUN mkdir -p /opt/whisper.cpp/models \
    && curl -L -o /tmp/whisper-cpp.zip \
      "https://github.com/ggerganov/whisper.cpp/releases/latest/download/main-build-x64.zip" \
    && unzip /tmp/whisper-cpp.zip -d /opt/whisper.cpp/ \
    && chmod +x /opt/whisper.cpp/main \
    && rm /tmp/whisper-cpp.zip

  # Baixar modelos (small + medium)
  RUN curl -L -o /opt/whisper.cpp/models/ggml-small.bin \
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin" \
    && curl -L -o /opt/whisper.cpp/models/ggml-medium.bin \
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin"

  ENV WHISPER_CPP_PATH=/opt/whisper.cpp/main
  ENV WHISPER_MODEL_DIR=/opt/whisper.cpp/models
```

**Arquivo:** `docker-compose.yml` (MODIFICAR)

```
Adicionar:
  environment:
    WHISPER_CPP_PATH: /opt/whisper.cpp/main
    WHISPER_MODEL_DIR: /opt/whisper.cpp/models
  volumes:
    - ./vendor/whisper/models:/opt/whisper.cpp/models
  mem_limit: 6g
  memswap_limit: 8g
```

---

## 3. Arquivos Afetados (Resumo)

| Arquivo | Ação | Etapa |
|---------|------|-------|
| `scripts/install-whisper.mjs` | **NOVO** | 1 |
| `package.json` | MODIFICAR | 1 |
| `src/transcribe/audio-extract.js` | **NOVO** | 2 |
| `src/transcribe/whisper-cpp.js` | **NOVO** | 3 |
| `src/transcribe/whisper-transformers.js` | **NOVO** | 4 |
| `src/transcribe/format.js` | **NOVO** | 5 |
| `src/transcribe/index.js` | **NOVO** | 6 |
| `src/core/engine/lifecycle.js` | MODIFICAR | 7 |
| `src/core/engine/index.js` | MODIFICAR | 7 |
| `src/core/settings.js` | MODIFICAR | 8 |
| `src/cli/commands.js` | MODIFICAR | 9 |
| `src/cli-flow/parse-flags.js` | MODIFICAR | 9 |
| `electron/renderer/video-tab-download.js` | MODIFICAR | 10 |
| `electron/ipc/queue-handlers.js` | MODIFICAR | 10 |
| `Dockerfile` | MODIFICAR | 11 |
| `docker-compose.yml` | MODIFICAR | 11 |

---

## 4. Ordem de Implementação

```
Fase 1 — Infraestrutura (fundação)
├── Etapa 1: Script install-whisper.mjs
├── Etapa 2: audio-extract.js
└── Etapa 5: format.js

Fase 2 — Engines de transcrição
├── Etapa 3: whisper-cpp.js
└── Etapa 4: whisper-transformers.js

Fase 3 — Integração
├── Etapa 6: index.js (API pública)
├── Etapa 7: lifecycle.js + index.js (engine)
├── Etapa 8: settings.js
└── Etapa 9: CLI flags

Fase 4 — UI e Docker
├── Etapa 10: Electron UI
└── Etapa 11: Docker
```

> **Justificativa:** A Fase 1 cria os blocos básicos (extração, formatação, instalação) que são independentes. A Fase 2 depende da Fase 1. A Fase 3 integra tudo no engine. A Fase 4 é apresentação (UI + Docker).

---

## 5. Testes

| Teste | Tipo | Procedimento | Resultado Esperado |
|-------|------|-------------|-------------------|
| install-whisper | Integração | Rodar `npm run whisper:install` | Binário + modelos salvos em vendor/whisper/ |
| audio-extract | Unitário | Extrair áudio de vídeo de 1 min | WAV 16kHz mono gerado, cleanup remove arquivo |
| audio-extract (sem áudio) | Unitário | Extrair de vídeo mudo | Erro amigável retornado |
| whisper-cpp (small) | Integração | Transcrever áudio de 1 min | Texto coerente retornado |
| whisper-cpp (medium) | Integração | Transcrever áudio de 1 min | Texto coerente retornado |
| whisper-cpp (cancel) | Unitário | Abortar transcrição | Processo morto, limpeza feita |
| whisper-transformers | Integração | Transcrever com fallback | Texto coerente retornado |
| format.txt | Unitário | Formatar texto puro | .txt com título e parágrafos |
| format.md | Unitário | Formatar com timestamps | .md com [MM:SS] por segmento |
| transcribeVideo | Integração | Pipeline completo (vídeo → .txt) | Arquivo gerado ao lado do vídeo |
| CLI --transcribe | Integração | `streamgrab download <url> --transcribe` | Transcrição executa pós-download |
| CLI --transcribe-quality max | Integração | Flag `--transcribe-quality max` | Modelo medium utilizado |
| Settings | Unitário | Salvar/recuperar config de transcrição | Valores persistidos corretamente |
| Engine integration | Integração | Download + transcrição no engine | Eventos emitidos, arquivos gerados |
| Electron IPC | Integração | Enqueue com opções de transcrição | Transcrição inicia no engine |
| Docker build | E2E | `docker-compose build` | Imagem de ~1.5 GB criada |
| Docker transcribe | E2E | Transcrever dentro do container | Funciona com ambos os modelos |
| Lint | Automático | `npm run lint` | 0 erros |

---

## 6. Critérios de Conclusão

- [ ] `npm run whisper:install` baixa binário + modelos (small + medium)
- [ ] Extração de áudio gera WAV 16kHz mono e limpa temporário
- [ ] whisper.cpp transcreve com modelo small (~15 min para 1h)
- [ ] whisper.cpp transcreve com modelo medium (~25 min para 1h)
- [ ] Fallback @xenova/transformers funciona quando cpp indisponível
- [ ] Formatação gera `.txt` limpo e `.md` com timestamps
- [ ] `--transcribe` funciona no CLI (opção rápida)
- [ ] `--transcribe --transcribe-quality max` usa modelo medium
- [ ] `--transcribe-lang` permite escolher idioma
- [ ] Progresso da transcrição é exibido (CLI + Electron)
- [ ] Botão "Transcrever" aparece no Electron pós-download
- [ ] Settings `transcribe*` persistem corretamente
- [ ] Dockerfile inclui whisper.cpp + ambos os modelos
- [ ] docker-compose tem `mem_limit: 6g`
- [ ] Arquivos temporários são limpos após transcrição
- [ ] Cancelamento (AbortSignal) mata processo whisper
- [ ] 783+ testes unitários continuam passando
- [ ] 17+ testes de integração continuam passando
- [ ] `npm run lint` sem erros
- [ ] README.md atualizado com documentação da feature
