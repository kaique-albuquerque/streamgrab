# Plano de Implementação — Tradução Local de Legendas com LLM

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Origem:** SPEC-10 — `docs/specs/10-traducao-legendas.md`
> **Prioridade:** Média | **Esforço:** Médio-Alto | **Riscos:** Médio (novo runtime de inferência)

**Goal:** Traduzir `.srt` em inglês para português 100% localmente com llama.cpp
e um LLM 4B, gerando legenda condensada que caiba no tempo de leitura.

**Architecture:** Runtime empacotado (`llama-server`) + modelo GGUF baixado sob
demanda, espelhando o padrão do whisper.cpp. Pipeline: parse SRT → blocos de 30
segmentos → `llama-server` local com JSON schema → segundo passe de encurtamento
→ SRT reconstruído com timestamps originais. Job próprio na fila da aba
Transcrever, reaproveitando o mesmo núcleo de fila da transcrição.

**Tech Stack:** Node 20 ESM, `node:test` + `node:assert/strict`, Electron 37,
llama.cpp `b12676` (assets pré-compilados), GGUF Q4_K_M.

**Spec:** `docs/specs/10-traducao-legendas.md`

## Global Constraints

- 100% local: nenhuma chamada de rede exceto o download do modelo (Hugging Face)
  e o HTTP para `127.0.0.1`.
- `llama-server` escuta apenas `127.0.0.1`, em porta efêmera, com `--no-webui` e
  `--api-key` gerado por sessão.
- Índices e timestamps do SRT de entrada são copiados **byte a byte**; só o texto
  muda.
- Alvo de leitura padrão: **17 caracteres por segundo** (`translateCharsPerSecond`).
- Modelo padrão: `qwen3-4b` (`Qwen3-4B-Instruct-2507-Q4_K_M.gguf`, 2 497 281 120
  bytes, SHA-256 `3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597`).
- Modelo opcional: `qwen2.5-7b` (`Qwen2.5-7B-Instruct-Q4_K_M.gguf`, 4 683 074 240
  bytes, SHA-256 `65b8fcd92af6b4fefa935c625d1ac27ea29dcb6ee14589c55a8f115ceaaa1423`).
- Nenhum arquivo acima de ~150 linhas (CONTRIBUTING); ao passar, extrair
  responsabilidade e manter barrel.
- Testes em `node:test` + `node:assert/strict`; sem runner novo.
- `npm run lint` termina com 0 erros e não aumenta os 6 avisos de baseline.
- Nenhum texto de legenda vai para logs; logs citam bloco e contagem.

---

## Review Focus

1. **Segmento com duração zero ou negativa** (`startMs === endMs`): a divisão
   caracteres/segundo explode em `Infinity` e o segmento entra em loop de
   encurtamento. Esperado: duração `< 1` é tratada como 1 s e o segmento nunca
   entra no segundo passe.
2. **Cue com múltiplas linhas e marcação** (`<i>`, `<b>`, `{\an8}`): texto
   processado errado vira tradução embaralhada ou tags órfãs no arquivo final.
   Esperado: linhas do cue são unidas com um espaço antes de ir ao modelo (o texto
   não é embaralhado) e a saída tem uma linha por cue; tags de formatação são
   preservadas no `build` quando o texto não muda e removidas do texto enviado ao
   modelo.
3. **O modelo não devolve todos os índices pedidos:** normalmente JSON válido com
   chaves faltando. Esperado: erro explícito nomeando os índices ausentes, nunca
   SRT com trechos em inglês misturados.
4. **`llama-server` não sobe** (binário ausente, DLL faltando, porta ocupada,
   modelo corrompido): o job fica pendurado esperando `/health` para sempre.
   Esperado: timeout com mensagem acionável e processo encerrado.
5. **SRT com BOM ou CRLF:** o primeiro índice sai como `\uFEFF1` e a linha de
   tempo quebra; cues viram lixo. Esperado: BOM removido e `\r\n` normalizado
   antes do parse.

---

### Task 1: Extrair o núcleo de fila reutilizável

**Files:**
- Create: `src/core/job-queue.js`
- Modify: `src/transcribe/job-manager.js`
- Test: `tests/unit/transcribe-job-manager.test.js` (existente — caracterização)

**Interfaces:**
- Consumes: nada.
- Produces: `createJobQueue({ maxConcurrent = 1, maxRetries = 2, retryDelayMs = 5000, storage = null, runner = null, onEvent = null, now = Date.now, createJob })` → `{ enqueue(params), cancel(jobId), retry(jobId), remove(jobId), list(), setMaxConcurrent(n), load(), dispose() }`. `createJob(ctx, params)` devolve o objeto de job completo, incluindo `jobId`. O núcleo cuida de `ctx.jobs`, `ctx.order`, `ctx.controllers`, `ctx.retryTimers`, `running`, `persist`, `emit` e do bombeamento.

- [ ] **Step 1: Rodar a suíte atual como linha de base**

Run: `npm run test:unit -- --test-name-pattern="job"` (ou `node --experimental-test-module-mocks --test tests/unit/transcribe-job-manager.test.js`)
Expected: todos os testes de `transcribe-job-manager` PASS antes da refatoração.

- [ ] **Step 2: Criar `src/core/job-queue.js` movendo a lógica de `job-manager/`**

Move `api.js`, `engine.js`, `actions.js`, `recovery.js` e a criação de `ctx` para
o núcleo, trocando a criação do job por `createJob(ctx, params)`. `JOB_STATUS` e
`snapshot()` continuam onde estão. Não alterar nenhum nome público do gerenciador
de transcrição.

- [ ] **Step 3: Reduzir `src/transcribe/job-manager.js` a um wrapper**

`createTranscriptionJobManager(options)` passa a chamar `createJobQueue({ ...options, createJob: makeTranscribeJob })`, onde `makeTranscribeJob` mantém exatamente os campos de hoje (`videoPath`, `language`, `formats`, `title`, `model`, `status`, `attempts`, `stage`, `percent`, `error`, `files`, `engine`, timestamps) e o `jobId` no formato `tr_<base36>_<n>`.

- [ ] **Step 4: Rodar a suíte de transcrição e confirmar comportamento idêntico**

Run: `node --experimental-test-module-mocks --test tests/unit/transcribe-job-manager.test.js`
Expected: PASS com os mesmos testes, sem edição no arquivo de teste.

- [ ] **Step 5: Commit**

```bash
git add src/core/job-queue.js src/transcribe/job-manager.js src/transcribe/job-manager/*.js
git commit -m "refactor: extrair nucleo de fila reutilizavel"
```

---

### Task 2: Parametrizar o model-manager por catálogo

**Files:**
- Modify: `src/transcribe/model-manager/download.js` (`getModelEntry` → catálogo injetável)
- Modify: `src/transcribe/model-manager/status.js`
- Test: `tests/unit/transcribe-model-manager.test.js`, `tests/unit/transcribe-model-download-ipc.test.js` (existentes)

**Interfaces:**
- Consumes: `MODEL_CATALOG` de `src/transcribe/model-manager/catalog.js`.
- Produces: `downloadModel({ modelsDir, model, catalog = MODEL_CATALOG, onProgress, signal, fetchImpl })` e `getModelStatus(modelsDir, model, { extraDirs = [], catalog = MODEL_CATALOG })` e `listModels(modelsDir, { extraDirs = [], catalog = MODEL_CATALOG })`. Assinaturas atuais continuam válidas.

- [ ] **Step 1: Rodar os testes de model-manager como linha de base**

Run: `node --experimental-test-module-mocks --test tests/unit/transcribe-model-manager.test.js`
Expected: PASS.

- [ ] **Step 2: Adicionar o parâmetro `catalog` com default `MODEL_CATALOG`**

Trocar as chamadas diretas a `getModelEntry(model)` / `listModelIds()` por
`catalog[model]` com guarda `Object.prototype.hasOwnProperty.call(catalog, model)`
e `Object.keys(catalog)`. `unknownModelError` recebe a lista de chaves.

- [ ] **Step 3: Rodar de novo e confirmar que nada mudou**

Run: `node --experimental-test-module-mocks --test tests/unit/transcribe-model-manager.test.js`
Expected: PASS, sem edição nos testes.

- [ ] **Step 4: Commit**

```bash
git add src/transcribe/model-manager/download.js src/transcribe/model-manager/status.js
git commit -m "refactor: permitir catalogo de modelos injetavel"
```

---

### Task 3: Catálogo GGUF e gerenciador de modelos de tradução

**Files:**
- Create: `src/translate/model-manager.js`
- Create: `src/translate/model-manager/catalog.js`
- Create: `src/translate/model-manager/models-dir.js`
- Modify: `src/core/settings/defaults.js` (chaves `translateModel`, `translateCharsPerSecond`)
- Test: `tests/unit/translate-model-catalog.test.js`, `tests/unit/core-settings.test.js`

**Interfaces:**
- Consumes: `downloadModel`, `getModelStatus`, `listModels`, `setModelsDirResolver` de `src/transcribe/model-manager.js`.
- Produces: `TRANSLATE_MODEL_CATALOG`, `DEFAULT_TRANSLATE_MODEL = 'qwen3-4b'`, `isKnownTranslateModel(model)`, `getTranslateModelEntry(model)`, `setTranslateModelsDirResolver(fn)`, `getTranslateModelsDir()`, `downloadTranslateModel({ model, onProgress, signal })`, `getTranslateModelStatus(model)`, `listTranslateModels()`; defaults `translateModel: 'qwen3-4b'` e `translateCharsPerSecond: 17` em `DEFAULT_SETTINGS`, com `SCHEMA.translateCharsPerSecond = { type: 'number', clamp: [10, 40] }`.

- [ ] **Step 1: Escrever o teste do catálogo**

```js
// tests/unit/translate-model-catalog.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TRANSLATE_MODEL, TRANSLATE_MODEL_CATALOG, getTranslateModelEntry,
} from '../../src/translate/model-manager/catalog.js';

test('default e qwen3-4b com sha256 e tamanho oficiais', () => {
  assert.equal(DEFAULT_TRANSLATE_MODEL, 'qwen3-4b');
  const info = getTranslateModelEntry('qwen3-4b');
  assert.equal(info.fileName, 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf');
  assert.equal(info.expectedSize, 2_497_281_120);
  assert.equal(info.sha256, '3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597');
});

test('modelo desconhecido nao herda de Object.prototype', () => {
  assert.equal(getTranslateModelEntry('constructor'), null);
  assert.equal(getTranslateModelEntry('__proto__'), null);
});

test('catalogo so expoe modelos com sha256 e minSize consistentes', () => {
  for (const [id, info] of Object.entries(TRANSLATE_MODEL_CATALOG)) {
    assert.ok(info.sha256?.length === 64, `${id} sem sha256`);
    assert.ok(info.minSize > 0 && info.minSize < info.expectedSize, `${id} minSize invalido`);
    assert.match(info.url, /^https:\/\/huggingface\.co\//);
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/unit/translate-model-catalog.test.js`
Expected: FAIL com `Cannot find module .../catalog.js`.

- [ ] **Step 3: Implementar `catalog.js` com os dois modelos da spec**

`expectedSize`, `sha256`, `url` e `minSize` (90% de `expectedSize`) exatamente como
na seção 3.5/Global Constraints da spec. Incluir `note` curto para a UI e
`heavy: true` só no `qwen2.5-7b`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/unit/translate-model-catalog.test.js`
Expected: 3 testes PASS.

- [ ] **Step 5: Escrever o teste de status/download com `fetchImpl` falso**

```js
test('download grava .part, verifica hash e promove', async () => {
  const modelsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trmodels-'));
  const body = Buffer.alloc(64);
  TRANSLATE_MODEL_CATALOG['qwen3-4b'].minSize = 16;      // catálogo é mutável (testes)
  TRANSLATE_MODEL_CATALOG['qwen3-4b'].expectedSize = 64;
  const status = await downloadTranslateModel({
    modelsDir, model: 'qwen3-4b',
    fetchImpl: async () => new Response(body, { status: 200, headers: { 'content-length': '64' } }),
  });
  assert.equal(status.installed, true);
});
```

> A verificação de SHA-256 usa o hash do catálogo; no teste, ajustar
> `TRANSLATE_MODEL_CATALOG['qwen3-4b'].sha256` para o hash de `body` para exercitar
> o caminho de sucesso, e restaurar no `afterEach`.

- [ ] **Step 6: Implementar `model-manager.js`**

`downloadTranslateModel` delega a `downloadModel({ modelsDir: getTranslateModelsDir(), model, catalog: TRANSLATE_MODEL_CATALOG, ... })`. `models-dir.js` guarda o resolvedor e devolve `''` quando não registrado (mesmo contrato do de transcrição).

- [ ] **Step 7: Rodar e ver passar, depois commit**

Run: `node --test tests/unit/translate-model-catalog.test.js`
Expected: PASS.

- [ ] **Step 8: Adicionar as chaves de settings**

Acrescentar `translateModel: 'qwen3-4b'` e `translateCharsPerSecond: 17` em
`DEFAULT_SETTINGS`, e as entradas correspondentes em `SCHEMA`. Em
`tests/unit/core-settings.test.js`, adicionar um teste que rejeita chave desconhecida e
faz clamp de `translateCharsPerSecond` fora do intervalo (9 → 10, 41 → 40).

- [ ] **Step 9: Rodar os testes de settings**

Run: `node --test tests/unit/core-settings.test.js`
Expected: PASS.

```bash
git add src/translate/model-manager.js src/translate/model-manager src/core/settings/defaults.js tests/unit/translate-model-catalog.test.js tests/unit/core-settings.test.js
git commit -m "feat(translate): catalogo e download de modelos GGUF"
```

---

### Task 4: Instalação e empacotamento do llama.cpp

**Files:**
- Create: `scripts/install-llama.mjs`
- Modify: `scripts/package-resources.mjs`
- Modify: `package.json` (`llama:install`, `postinstall`)
- Test: `tests/unit/install-llama-plan.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `buildLlamaPlan({ platform, arch, tag })` → `{ url, archiveType, binName, filesToCopy }`; `vendor/llama/` com o executável, todas as bibliotecas da distribuição e `.installed` (`{ platform, arch, tag, bin }`).

- [ ] **Step 1: Escrever o teste do plano de download por plataforma**

```js
test('plano win x64 usa zip cpu e copia dlls', () => {
  const p = buildLlamaPlan({ platform: 'win32', arch: 'x64', tag: 'b12676' });
  assert.match(p.url, /llama-b12676-bin-win-cpu-x64\.zip$/);
  assert.equal(p.archiveType, 'zip');
  assert.equal(p.binName, 'llama-server.exe');
});

test('plano macos arm64 usa tar.gz', () => {
  const p = buildLlamaPlan({ platform: 'darwin', arch: 'arm64', tag: 'b12676' });
  assert.match(p.url, /llama-b12676-bin-macos-arm64\.tar\.gz$/);
  assert.equal(p.binName, 'llama-server');
});

test('plataforma sem asset suportado lanca erro acionavel', () => {
  assert.throws(() => buildLlamaPlan({ platform: 'win32', arch: 'arm64', tag: 'b12676' }), /nao ha binario/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/unit/install-llama-plan.test.js`
Expected: FAIL (`buildLlamaPlan` não definido).

- [ ] **Step 3: Implementar `buildLlamaPlan` e o fluxo de instalação**

Exportar `buildLlamaPlan` do script e executar o `main()` só quando chamado
diretamente (mesmo padrão de `package-resources.mjs`). Extração: `Expand-Archive`
via `powershell.exe` no Windows para zip e `tar` para `tar.gz` nos demais — reusar
o padrão de `install-ffmpeg.mjs`. Copiar **todas** as bibliotecas da pasta
(`*.dll` no Windows, `*.so*`/`*.dylib` fora), porque `llama-server` é stub.
Creditar `WHISPER_SKIP_DOWNLOAD`-like: `LLAMA_SKIP_DOWNLOAD=1` pula em CI.

- [ ] **Step 4: Rodar os testes do plano**

Run: `node --test tests/unit/install-llama-plan.test.js`
Expected: 3 PASS.

- [ ] **Step 5: Incluir `llama-server` no empacotamento**

Em `scripts/package-resources.mjs`, adicionar entrada opcional `llama-server`
(origem `vendor/llama`), com `depsDir` copiando as bibliotecas — mesmo mecanismo
já usado pelas DLLs do FFmpeg. Adicionar teste em
`tests/unit/package-resources.test.js` cobrindo `required: false` e presença de
`depsDir`.

- [ ] **Step 6: Rodar testes de empacotamento e commit**

Run: `node --test tests/unit/package-resources.test.js`
Expected: PASS.

```bash
git add scripts/install-llama.mjs scripts/package-resources.mjs package.json tests/unit/install-llama-plan.test.js tests/unit/package-resources.test.js
git commit -m "feat(translate): instalacao e empacotamento do llama.cpp"
```

---

### Task 5: Detecção do binário e ciclo de vida do `llama-server`

**Files:**
- Create: `src/translate/llama-cpp.js`
- Create: `src/translate/llama-cpp/detect.js`
- Create: `src/translate/llama-cpp/paths.js`
- Create: `src/translate/llama-cpp/server.js`
- Test: `tests/unit/translate-llama-detect.test.js`

**Interfaces:**
- Consumes: `binName`, `packagedBinaryPath` de `src/core/binaries.js`.
- Produces: `checkLlamaCpp()` → `{ available, binPath }`; `startServer({ binPath, modelPath, signal, onLog, fetchImpl })` → `{ baseUrl, apiKey, stop() }`; `SERVER_START_TIMEOUT_MS = 120000`.

- [ ] **Step 1: Escrever os testes de detecção**

```js
test('usa LLAMA_CPP_PATH quando o arquivo existe', () => {
  process.env.LLAMA_CPP_PATH = binPathExistente; // criado no teste via fs.writeFileSync
  assert.equal(checkLlamaCpp().binPath, binPathExistente);
  delete process.env.LLAMA_CPP_PATH;
});

test('sem binario em lugar nenhum, available e false', () => {
  assert.equal(checkLlamaCpp().available, false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/unit/translate-llama-detect.test.js`
Expected: FAIL (módulo ausente).

- [ ] **Step 3: Implementar `detect.js` e `paths.js`**

Ordem: `LLAMA_CPP_PATH` → `packagedBinaryPath('llama-server')` → `vendor/llama` com
marker válido (`platform`, `arch`, `bin`) → `where/which llama-server`. Mesmo
formato de `src/transcribe/whisper-cpp/detect.js`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/unit/translate-llama-detect.test.js`
Expected: PASS.

- [ ] **Step 5: Escrever o teste de falha de start**

```js
test('server que nunca fica saudavel falha com timeout acionavel', async () => {
  await assert.rejects(
    startServer({
      binPath: 'no-such-binary', modelPath: 'no-such-model.gguf',
      fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
      startTimeoutMs: 250,
    }),
    /nao iniciou|llama-server/,
  );
});
```

- [ ] **Step 6: Implementar `server.js`**

Porta `0` (`--port 0`) com leitura da porta efetiva do log do processo; `--host
127.0.0.1`, `--no-webui`, `--no-warmup`, `--api-key <random 32 bytes hex>`,
`-m <modelPath>`, `-c 8192`. Poll em `/health` a cada 250 ms até 200 ou timeout.
`stop()` mata o processo e espera o `close`. Registrar `signal` para abortar.

- [ ] **Step 7: Rodar, depois commit**

Run: `node --test tests/unit/translate-llama-detect.test.js`
Expected: PASS.

```bash
git add src/translate/llama-cpp.js src/translate/llama-cpp tests/unit/translate-llama-detect.test.js
git commit -m "feat(translate): deteccao e ciclo de vida do llama-server"
```

---

### Task 6: Cliente de chat com JSON schema

**Files:**
- Create: `src/translate/llama-cpp/chat.js`
- Test: `tests/unit/translate-llama-chat.test.js`

**Interfaces:**
- Consumes: `{ baseUrl, apiKey }` de `startServer`.
- Produces: `chatJson({ baseUrl, apiKey, system, user, schema, signal, fetchImpl })` → `Promise<object>`; `ChatJsonError` com `missing`/`invalid` para diagnóstico.

- [ ] **Step 1: Escrever os testes**

```js
test('envia response_format json_schema e devolve objeto', async () => {
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(init.headers.authorization, 'Bearer k');
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"1":"Oi"}' } }] }), { status: 200 });
  };
  const out = await chatJson({ baseUrl: 'http://127.0.0.1:1', apiKey: 'k', system: 's', user: 'u', schema: {}, fetchImpl });
  assert.deepEqual(out, { 1: 'Oi' });
});

test('conteudo que nao e JSON vira ChatJsonError', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ops' } }] }), { status: 200 });
  await assert.rejects(chatJson({ /* ... */ fetchImpl }), ChatJsonError);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/unit/translate-llama-chat.test.js`
Expected: FAIL (módulo ausente).

- [ ] **Step 3: Implementar `chat.js`**

POST `{baseUrl}/v1/chat/completions` com `temperature: 0.2`, `top_p: 0.9`,
`max_tokens: 4096`, `stream: false`, `response_format: { type: 'json_schema',
json_schema: { name: 'translated_subtitles', strict: true, schema } }`. Extrair
`choices[0].message.content`, `JSON.parse`, e validar que é objeto não-array.

- [ ] **Step 4: Rodar e ver passar, depois commit**

Run: `node --test tests/unit/translate-llama-chat.test.js`
Expected: PASS.

```bash
git add src/translate/llama-cpp/chat.js tests/unit/translate-llama-chat.test.js
git commit -m "feat(translate): cliente de chat com json schema"
```

---

### Task 7: Parse e reconstrução de SRT preservando tempos

**Files:**
- Create: `src/translate/srt.js`
- Create: `src/translate/srt/parse.js`
- Create: `src/translate/srt/build.js`
- Test: `tests/unit/translate-srt.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `parseSrt(text)` → `{ cues, eol, bom }` onde `cues = [{ index, timing, startMs, endMs, lines }]` e `timing` é a linha original `00:00:01,000 --> 00:00:02,500`; `buildSrt({ cues, bom, eol })` → string.

- [ ] **Step 1: Escrever os testes de ida e volta**

```js
test('build(parse(x)) preserva timing e eol', () => {
  const src = '1\r\n00:00:01,000 --> 00:00:02,500\r\nHello\r\n\r\n2\r\n00:00:02,600 --> 00:00:04,000\r\nWorld\r\n';
  const doc = parseSrt(src);
  assert.equal(doc.eol, '\r\n');
  assert.equal(buildSrt(doc), src);
});

test('BOM e removido e nao vira parte do indice', () => {
  const doc = parseSrt('\uFEFF1\n00:00:00,000 --> 00:00:01,000\nHi\n');
  assert.equal(doc.cues[0].index, 1);
  assert.equal(doc.bom, '\uFEFF');
});

test('cue multilinha mantem as linhas separadas', () => {
  const doc = parseSrt('1\n00:00:00,000 --> 00:00:02,000\nlinha um\nlinha dois\n');
  assert.deepEqual(doc.cues[0].lines, ['linha um', 'linha dois']);
});

test('tags de formatacao sobrevivem ao round-trip sem alterar timing', () => {
  const src = '1\n00:00:00,000 --> 00:00:02,000\n<i>Hello</i> {\\an8}World\n';
  const doc = parseSrt(src);
  assert.equal(doc.cues[0].lines[0], '<i>Hello</i> {\\an8}World');
  assert.equal(buildSrt(doc), src);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/unit/translate-srt.test.js`
Expected: FAIL (módulo ausente).

- [ ] **Step 3: Implementar `parse.js` e `build.js`**

Normalizar BOM e guardar `eol` detectado. Guardar a **linha de tempo original
intacta** em `timing` e reconstruí-la sem reformatar. Cue malformado (sem índice
numérico ou sem linha de tempo válida) é descartado e contado em
`doc.skipped`. Duração zero é aceita no parse; quem trata é o medidor.

- [ ] **Step 4: Rodar e ver passar, depois commit**

Run: `node --test tests/unit/translate-srt.test.js`
Expected: PASS.

```bash
git add src/translate/srt.js src/translate/srt tests/unit/translate-srt.test.js
git commit -m "feat(translate): parse e build de srt preservando tempos"
```

---

### Task 8: Prompt, blocos e medição de leitura

**Files:**
- Create: `src/translate/prompt.js`
- Create: `src/translate/prompt/blocks.js`
- Create: `src/translate/prompt/schema.js`
- Create: `src/translate/prompt/measure.js`
- Test: `tests/unit/translate-prompt.test.js`

**Interfaces:**
- Consumes: `cues` de `parseSrt`.
- Produces: `BLOCK_SIZE = 30`; `toBlocks(cues, size = BLOCK_SIZE)` → `Array<Array<cue>>`; `buildSystemPrompt({ targetLang, charsPerSecond })` → string; `buildUserPrompt(cues)` → string; `buildSchema()` → object; `charsPerSecondOf({ text, startMs, endMs })` → number; `overTarget(cues, translated, limit)` → `number[]`.

- [ ] **Step 1: Escrever os testes**

```js
test('blocos de 30 sem sobreposicao e sem perder cues', () => {
  const cues = Array.from({ length: 65 }, (_, i) => ({ index: i + 1 }));
  const blocks = toBlocks(cues);
  assert.deepEqual(blocks.map((b) => b.length), [30, 30, 5]);
  assert.equal(blocks.flat().length, 65);
});

test('duracao zero e tratada como 1 segundo', () => {
  const cps = charsPerSecondOf({ text: 'abcdefghij', startMs: 1000, endMs: 1000 });
  assert.equal(cps, 10);
});

test('segmentos acima do alvo sao listados', () => {
  const cues = [
    { index: 1, startMs: 0, endMs: 1000, text: 'a'.repeat(40) },
    { index: 2, startMs: 0, endMs: 4000, text: 'a'.repeat(40) },
  ];
  assert.deepEqual(overTarget(cues, { 1: 'a'.repeat(40), 2: 'a'.repeat(40) }, 17), [1]);
});

test('schema exige objeto com chaves string', () => {
  const s = buildSchema();
  assert.equal(s.type, 'object');
  assert.equal(s.additionalProperties.type, 'string');
});

test('system prompt pede condensacao com o alvo numerico', () => {
  assert.match(buildSystemPrompt({ targetLang: 'pt', charsPerSecond: 17 }), /17/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/unit/translate-prompt.test.js`
Expected: FAIL (módulos ausentes).

- [ ] **Step 3: Implementar os quatro módulos**

`buildUserPrompt` lista `índice | segundos | texto` e pede JSON com os mesmos
índices. `buildSchema` usa `additionalProperties: { type: 'string' }` (chaves
variáveis por bloco). `measure` usa `Math.max(1, endMs - startMs)` para o
denominador. `overTarget` ignora índices sem tradução e retorna em ordem
crescente.

- [ ] **Step 4: Rodar e ver passar, depois commit**

Run: `node --test tests/unit/translate-prompt.test.js`
Expected: PASS.

```bash
git add src/translate/prompt.js src/translate/prompt tests/unit/translate-prompt.test.js
git commit -m "feat(translate): blocos, prompt e medicao de leitura"
```

---

### Task 9: Pipeline de tradução com segundo passe

**Files:**
- Create: `src/translate/pipeline.js`
- Create: `src/translate/validate.js`
- Test: `tests/unit/translate-pipeline.test.js`

**Interfaces:**
- Consumes: tudo das tasks 3, 5, 6, 7, 8.
- Produces: `translateSrt({ cues, doc, chat, onProgress, onLog, charsPerSecond })` → `{ cues: cue[], overTarget: number[] }` onde cada cue ganha `translatedLines`.

- [ ] **Step 1: Escrever os testes com um `chat` falso**

```js
test('traduz todos os blocos e mantem index/timing originais', async () => {
  const doc = parseSrt('1\n00:00:00,000 --> 00:00:02,000\nHello\n\n2\n00:00:02,000 --> 00:00:04,000\nWorld\n');
  const chat = async ({ user }) => user.includes('Hello') ? { 1: 'Ola', 2: 'Mundo' } : {};
  const out = await translateSrt({ cues: doc.cues, doc, chat, charsPerSecond: 17 });
  assert.equal(out.cues[0].index, 1);
  assert.equal(out.cues[0].timing, '00:00:00,000 --> 00:00:02,000');
  assert.equal(out.cues[0].translatedLines.join(' '), 'Ola');
});

test('indice ausente na resposta gera erro com a lista de faltantes', async () => {
  const doc = parseSrt('1\n00:00:00,000 --> 00:00:02,000\nHello\n\n2\n00:00:02,000 --> 00:00:04,000\nWorld\n');
  const chat = async () => ({ 1: 'Ola' });
  await assert.rejects(translateSrt({ cues: doc.cues, doc, chat }), /2/);
});

test('segundo passe so recebe os indices acima do alvo', async () => {
  const chamadas = [];
  const chat = async (req) => { chamadas.push(req.user); return req.user.includes('encurte') ? { 1: 'curto' } : { 1: 'a'.repeat(80) }; };
  const doc = parseSrt('1\n00:00:00,000 --> 00:00:01,000\nHello\n');
  await translateSrt({ cues: doc.cues, doc, chat, charsPerSecond: 17 });
  assert.equal(chamadas.length, 2);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/unit/translate-pipeline.test.js`
Expected: FAIL (módulo ausente).

- [ ] **Step 3: Implementar `validate.js`**

`assertAllIndices(block, response)` lança `MissingIndicesError` com `.missing`
ordenado; rejeita valores vazios/só espaços e valores não-string.

- [ ] **Step 4: Implementar `pipeline.js`**

Para cada bloco: `chat({ system, user, schema })` → `assertAllIndices` → aplica.
Depois de todos os blocos: `overTarget` → novo prompt pedindo encurtamento só
desses índices → aplica → recalcula `overTarget`. Emite `onProgress` com
`{ stage: 'translating', block, totalBlocks, percent }` e
`{ stage: 'shortening', block: 1, totalBlocks: 1, percent }`.
Nunca escreve arquivo: só devolve dados.

- [ ] **Step 5: Rodar e ver passar, depois commit**

Run: `node --test tests/unit/translate-pipeline.test.js`
Expected: PASS.

```bash
git add src/translate/pipeline.js src/translate/validate.js tests/unit/translate-pipeline.test.js
git commit -m "feat(translate): pipeline com validacao e segundo passe"
```

---

### Task 10: API pública e job manager de tradução

**Files:**
- Create: `src/translate/index.js`
- Create: `src/translate/job-manager.js`
- Create: `src/translate/write.js`
- Test: `tests/unit/translate-api.test.js`

**Interfaces:**
- Consumes: `createJobQueue` (Task 1), `startServer`, `chatJson`, `parseSrt`, `buildSrt`, `translateSrt`, `checkLlamaCpp`, `getTranslateModelStatus`.
- Produces: `translateSubtitle(options)` → `TranslateResult` (contrato 4.1 da spec); `createTranslateJobManager(options)` com `enqueue({ srtPath, model, targetLang })`; `defaultTranslateRunner(params)`.

- [ ] **Step 1: Escrever o teste de ponta a ponta com dublês**

```js
test('translateSubtitle escreve .pt.srt ao lado e preserva tempos', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-'));
  const srtPath = path.join(dir, 'v.transcription.srt');
  fs.writeFileSync(srtPath, '1\n00:00:00,000 --> 00:00:02,000\nHello\n', 'utf8');
  const result = await translateSubtitle({
    srtPath,
    deps: { startServer: fakeServer, chat: async () => ({ 1: 'Ola' }) },
  });
  assert.equal(result.outputPath, path.join(dir, 'v.transcription.pt.srt'));
  assert.match(fs.readFileSync(result.outputPath, 'utf8'), /-->/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/unit/translate-api.test.js`
Expected: FAIL (módulo ausente).

- [ ] **Step 3: Implementar `write.js` e `index.js`**

`write.js`: grava em `<base>.pt.srt` via `fs.writeFileSync` com o mesmo `eol`/`bom`
do original; nunca toca na entrada. `index.js`: valida que `srtPath.endsWith('.srt')`,
resolve modelo (`isKnownTranslateModel`), verifica status instalado (erro
acionável se não), pega `{ binPath }` de `checkLlamaCpp`, sobe o server, roda o
pipeline, encerra o server **em `finally`** e devolve o resultado. Aceita `deps`
injetável para testes. Se qualquer bloco falhar, nenhum arquivo é escrito —
a escrita acontece só depois de todos os blocos validados.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/unit/translate-api.test.js`
Expected: PASS.

- [ ] **Step 5: Escrever o teste de falha no meio do job**

```js
test('erro no bloco 2 nao deixa .pt.srt parcial', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-'));
  const srtPath = path.join(dir, 'v.transcription.srt');
  const cues = Array.from({ length: 35 }, (_, i) => `${i + 1}\n00:00:0${i % 10},000 --> 00:00:0${i % 10},500\nHello ${i}`).join('\n\n');
  fs.writeFileSync(srtPath, `${cues}\n`, 'utf8');
  let calls = 0;
  const chat = async () => { calls++; if (calls === 2) throw new Error('boom'); return { 1: 'ok' }; };
  await assert.rejects(translateSubtitle({ srtPath, deps: { startServer: fakeServer, chat } }));
  assert.equal(fs.existsSync(path.join(dir, 'v.transcription.pt.srt')), false);
});
```

- [ ] **Step 6: Implementar `job-manager.js`**

`createTranslateJobManager` chama `createJobQueue({ maxConcurrent: 1, createJob: makeTranslateJob, runner: defaultTranslateRunner, ...options })`. `jobId` no formato `tl_<base36>_<n>`. Campos: `srtPath`, `targetLang`, `model`, `status`, `attempts`, `stage`, `percent`, `error`, `files`, `overTarget`, timestamps.

- [ ] **Step 7: Rodar e ver passar, depois commit**

Run: `node --test tests/unit/translate-api.test.js`
Expected: PASS.

```bash
git add src/translate/index.js src/translate/job-manager.js src/translate/write.js tests/unit/translate-api.test.js
git commit -m "feat(translate): api publica e fila de jobs"
```

---

### Task 11: IPC, preload e validação de payload

**Files:**
- Create: `electron/security-payloads-translate.js`
- Create: `electron/ipc/translate-handlers.js`
- Create: `electron/ipc/translate/shared.js`
- Create: `electron/ipc/translate/job-handlers.js`
- Create: `electron/ipc/translate/job-control-handlers.js`
- Create: `electron/ipc/translate/model-handlers.js`
- Create: `electron/ipc/translate/model-download-handlers.js`
- Modify: `electron/ipc/app-handlers.js` (canal `app:pick-subtitle-file`)
- Modify: `electron/preload.cjs`
- Modify: `electron/main.js` (registrar handlers)
- Test: `tests/unit/translate-security-payloads.test.js`, `tests/unit/translate-ipc.test.js`

**Interfaces:**
- Consumes: `translateSubtitle`, `createTranslateJobManager`, `getTranslateModelStatus`, `downloadTranslateModel`.
- Produces: `validateTranslateStartPayload(raw)` → `{ srtPath, model, targetLang } | null`; `pickSubtitleFile()` no renderer → caminho absoluto do `.srt` ou `null`; canais listados na seção 4.3 da spec; `window.api.translate*` e `onTranslate*`.

- [ ] **Step 1: Escrever os testes de validação**

```js
test('rejeita extensao diferente de .srt', () => {
  assert.equal(validateTranslateStartPayload({ srtPath: 'C:/x/v.txt', model: 'qwen3-4b', targetLang: 'pt' }), null);
});
test('rejeita caminho inexistente', () => {
  assert.equal(validateTranslateStartPayload({ srtPath: 'C:/nao/existe.srt', model: 'qwen3-4b', targetLang: 'pt' }), null);
});
test('aceita payload valido e normaliza targetLang', () => {
  const p = validateTranslateStartPayload({ srtPath: srtReal, model: 'qwen3-4b', targetLang: 'PT' });
  assert.deepEqual(p, { srtPath: srtReal, model: 'qwen3-4b', targetLang: 'pt' });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/unit/translate-security-payloads.test.js`
Expected: FAIL (módulo ausente).

- [ ] **Step 3: Implementar `security-payloads-translate.js`**

Espelhar `security-payloads-transcribe.js`: `path.isAbsolute`, `fs.existsSync` +
`statSync().isFile()`, extensão `.srt` (case-insensitive), modelo via
`isKnownTranslateModel`, `targetLang` em `new Set(['pt'])`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/unit/translate-security-payloads.test.js`
Expected: PASS.

- [ ] **Step 5: Escrever o teste de registro dos canais**

Reusar o mock de `electron` de `transcribe-model-download-ipc.test.js`: registrar
handlers e afirmar que `translate:start`, `translate:cancel`, `translate:models`,
`translate:model-download`, `translate:model-cancel`, `translate:model-delete`
existem.

- [ ] **Step 6: Implementar handlers, preload e registro no main**

`shared.js` com `TRANSLATE_MODULE`, `TRANSLATE_MODEL_MANAGER_MODULE`,
`broadcast`, `bindTranslateModelsDir(app)` (`userData/translate/models`) e ponte
de eventos. `job-handlers.js` valida payload antes de enfileirar e responde
`{ ok: false, error }` em payload inválido. `preload.cjs` expõe as funções e
listeners. Em `app-handlers.js`, adicionar `app:pick-subtitle-file` com
`filters: [{ name: 'Legendas', extensions: ['srt'] }]`, `addRevealRoot` do
diretório e retorno `null` em cancelamento — mesmo formato do
`app:pick-media-file`.

- [ ] **Step 7: Rodar e ver passar, depois commit**

Run: `node --test tests/unit/translate-ipc.test.js`
Expected: PASS.

```bash
git add electron/security-payloads-translate.js electron/ipc/translate-handlers.js electron/ipc/translate electron/preload.cjs electron/main.js electron/security.js tests/unit/translate-security-payloads.test.js tests/unit/translate-ipc.test.js
git commit -m "feat(translate): canais ipc e validacao de payload"
```

---

### Task 12: UI — card de tradução e lista de jobs

**Files:**
- Modify: `electron/templates/transcribe.html`
- Create: `electron/renderer/panel-translate.js`
- Create: `electron/renderer/panel-translate/start.js`
- Create: `electron/renderer/panel-translate/model.js`
- Modify: `electron/renderer/panel-transcribe.js` (delegar card)
- Modify: `electron/renderer/panel-constants.js` (`TRANSLATE_STATE_LABELS`, `TRANSLATE_STAGE_LABELS`)
- Modify: `electron/renderer/bootstrap/transcribe-events.js` (eventos de tradução)
- Test: `tests/unit/translate-panel-events.test.js`

**Interfaces:**
- Consumes: `window.api.translate*`.
- Produces: `createTranslatePanel()` → `{ mount(root), refresh(), handleEvent(type, data) }`; rótulos `queued: 'Aguardando'`, `running: 'Traduzindo'`, `done: 'Traduzido'`, `error: 'Falhou'`, `cancelled: 'Cancelado'`; stages `queued`, `starting`, `translating`, `shortening`, `writing`, `done`.

- [ ] **Step 1: Escrever o teste de rótulos e eventos**

```js
test('stage shortening tem rotulo proprio', () => {
  assert.equal(TRANSLATE_STAGE_LABELS.shortening, 'Encurtando legendas');
});
test('evento progress atualiza percentual do job', () => {
  const panel = createTranslatePanel({ api: fakeApi, doc: fakeDoc() });
  panel.handleEvent('progress', { jobId: 'tl_1', percent: 42 });
  assert.equal(fakeDoc().percentText(), '42%');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/unit/translate-panel-events.test.js`
Expected: FAIL (módulo ausente).

- [ ] **Step 3: Adicionar o card ao template**

Bloco novo em `transcribe.html` depois da lista de jobs: select de modelo,
botão `translateModelDownloadBtn` com progresso, botão
`translateStartBtn` e `<p id="translateNewHint">`. Reusar classes
`card`, `transcribe-field`, `button-primary`.

- [ ] **Step 4: Implementar o painel**

`start.js` valida modelo instalado, chama `window.api.pickSubtitleFile()` (novo
canal `app:pick-subtitle-file` com filtro `srt`), enfileira e mostra hint.
`model.js` renderiza status/download/delete. O painel consome os mesmos padrões de
`panel-transcribe/start.js` e `panel-transcribe-model`.

- [ ] **Step 5: Rodar e ver passar, depois commit**

Run: `node --test tests/unit/translate-panel-events.test.js`
Expected: PASS.

```bash
git add electron/templates/transcribe.html electron/renderer/panel-translate.js electron/renderer/panel-translate electron/renderer/panel-transcribe.js electron/renderer/panel-constants.js electron/renderer/bootstrap/transcribe-events.js tests/unit/translate-panel-events.test.js
git commit -m "feat(translate): card e fila na aba transcrever"
```

---

### Task 13: CLI `streamgrab translate`

**Files:**
- Create: `src/cli/commands/translate.js`
- Modify: `src/cli/commands/parse-command.js`
- Modify: `src/cli/commands/help.js`
- Modify: `src/index.js`
- Test: `tests/unit/translate-command.test.js`

**Interfaces:**
- Consumes: `translateSubtitle`.
- Produces: `parseTranslateFlags(rest)` → `{ model, targetLang }`; `runTranslateCommand({ srtPath, io, flags })` → `{ code }`; subcomando reconhecido em `parseCliCommand`.

- [ ] **Step 1: Escrever o teste de parse**

```js
test('translate reconhece subcomando e flags', () => {
  const { command, url, rest } = parseCliCommand(['translate', 'a.srt', '--model', 'qwen2.5-7b']);
  assert.equal(command, 'translate');
  assert.equal(url, 'a.srt');
  assert.deepEqual(parseTranslateFlags(rest), { model: 'qwen2.5-7b', targetLang: 'pt' });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/unit/translate-command.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar o subcomando**

`parse-command.js` inclui `'translate'` na lista de comandos com URL. `index.js`
despacha para `runTranslateCommand`, que imprime progresso por bloco, o caminho
final e a linha de aviso quando `overTarget.length > 0`. `help.js` documenta
`translate <arquivo.srt>` e `--model`.

- [ ] **Step 4: Rodar e ver passar, depois commit**

Run: `node --test tests/unit/translate-command.test.js`
Expected: PASS.

```bash
git add src/cli/commands/translate.js src/cli/commands/parse-command.js src/cli/commands/help.js src/index.js tests/unit/translate-command.test.js
git commit -m "feat(translate): subcomando translate na cli"
```

---

### Task 14: Documentação e verificação final

**Files:**
- Modify: `README.md`
- Modify: `docs/specs/10-traducao-legendas.md` (Status → Implementado)
- Modify: `package.json` (keywords `translation`, `llama-cpp`)

- [ ] **Step 1: Documentar no README**

Seção curta em Recursos: tradução local de `.srt` EN→PT, modelo 2,4 GB baixado na
primeira execução, 100% offline, comando da CLI e caminho na UI.

- [ ] **Step 2: Rodar a suíte completa e o lint**

Run: `npm test`
Expected: todos PASS, incluindo os 10 testes novos.

Run: `npm run lint`
Expected: 0 erros; no máximo os 6 avisos de baseline.

- [ ] **Step 3: Rodar o verificador de tamanho de arquivo**

Run: `npm run analisar:linhas`
Expected: nenhum arquivo novo acima de ~150 linhas.

- [ ] **Step 4: Commit**

```bash
git add README.md package.json docs/specs/10-traducao-legendas.md
git commit -m "docs(translate): documentar traducao local de legendas"
```

---

## Verificação manual (fora do TDD)

Depois da Task 14, validar com um vídeo real:

1. Transcrever um vídeo em inglês com modelo `small`, marcando `.srt`.
2. Clicar em **Traduzir legendas**, escolher `qwen3-4b`, baixar o modelo.
3. Confirmar que `video.transcription.pt.srt` abre no VLC e sincroniza.
4. Comparar 5 trechos: a legenda PT cabe no tempo e não parece tradução de manual.
5. Cancelar um job no meio e confirmar que o `llama-server` morreu (Gerenciador de
   Tarefas) e que nenhum `.pt.srt` parcial existe.