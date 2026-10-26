# Auditoria de código — streamgrab

**Data:** 23/10/2026  
**Escopo:** `src/`, `electron/`, `scripts/`, `tests/`, `package.json`, `eslint.config.js`  
**Natureza:** diagnóstico somente-leitura. **Nenhum arquivo de código foi alterado nesta auditoria.**

---

## 1. Método

| Técnica | O que produziu |
|---|---|
| ESLint em formato JSON, agrupado por regra | 305 warnings / 0 erros classificados por arquivo:linha |
| Grafo estático de `import`/`require`/`import()` a partir dos entrypoints (`src/index.js`, `electron/main/index.js`, `electron/preload.cjs`) | 436 de 475 módulos alcançáveis → **39 inalcançáveis** |
| Varredura de especificadores de import contra `package.json` | 2 dependências usadas e não declaradas |
| Busca por `setInterval`/`setTimeout`/`unref`/`dispose`/`kill`/`ipcRenderer.on` | 6 timers e 3 APIs de ciclo de vida sem contrapartida |
| Leitura dirigida dos módulos de risco | confirmação manual de cada achado (nada aqui é inferido só por grep) |

**Baseline verificado no início da auditoria:** `test:unit` 865/865, `test:integration` 45/45, `test:e2e` verde, `lint` 0 erros / 305 warnings, nenhum arquivo acima de 150 linhas.

---

## 2. Resumo executivo

| Severidade | Qtd | Temas |
|---|---|---|
| 🔴 Crítico | 2 | falha de boot sem handler global de erro; dependência não declarada que desativa um backend inteiro |
| 🟠 Alto | 4 | cache de preview ilimitado; timers sem `unref`; `dispose()` nunca chamado; listeners IPC sem unsubscribe |
| 🟡 Médio | 5 | escrita atômica sem `fsync`/retry; diretório temporário órfão; feature morta de ~19 arquivos; `kill()` sem árvore; barrels redundantes |
| ⚪ Baixo | 7 | 35 imports/vars mortos; dynamic imports repetidos; complexidade; config de lint; mojibake |

Nenhum achado crítico quebra o fluxo principal hoje — o app inicia, baixa e transcreve. Os itens 🔴 são **falhas silenciosas**: quando acontecem, não há sintoma visível além de "não funcionou".

---

## 3. Achados

### 3.1 🔴 Crítico

#### C1 — Falha de boot do Electron não é tratada em nenhum lugar

[electron/main/index.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/electron/main/index.js:19)

```js
app.whenReady().then(initializeApp);
```

- `initializeApp()` ([electron/main/bootstrap.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/electron/main/bootstrap.js:21)) faz `app.getPath('userData')`, cria serviços com persistência, registra IPC e cria a janela. **Qualquer exceção** (JSON corrompido, EPERM ao criar diretório, porta ocupada, handler duplicado) rejeita essa promise **sem `.catch`**.
- Busca em todo o projeto: **zero** ocorrências de `process.on('uncaughtException')` e **zero** de `process.on('unhandledRejection')`.
- Resultado no Electron: nenhuma janela, nenhum log, nenhum `dialog.showErrorBox`. O usuário vê "o app não abre" e o suporte não tem nada para ler.

**Proposta:** `.catch()` em `whenReady` que registre o erro em arquivo (`userData/logs`), mostre `dialog.showErrorBox` e faça `app.quit()`; opcionalmente handlers globais que loguem e encerrem de forma controlada.

#### C2 — `@xenova/transformers` é importado mas não está declarado em `package.json`

[src/transcribe/whisper-transformers/model.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/transcribe/whisper-transformers/model.js:20) e :57

```js
await import('@xenova/transformers');
```

- `package.json` declara apenas `youtube-dl-exec` em `dependencies` (devDeps: electron, electron-builder, eslint, ntl, prettier). `@xenova/transformers` não aparece em **nenhuma** seção.
- Como `checkTransformers()` engole o `ERR_MODULE_NOT_FOUND` com `catch { return false }`, o sintoma é mudo: [electron/ipc/transcribe/job-handlers.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/electron/ipc/transcribe/job-handlers.js:39) sempre reporta `transformers: { available: false }`.
- Ou seja: existe um backend de transcrição inteiro (`whisper-transformers/`: 3 arquivos) que **nunca pode executar**, nem em dev nem no app empacotado.

**Proposta:** decidir entre (a) declarar como `optionalDependencies` e documentar o download de modelo, ou (b) remover o backend e a checagem, deixando o whisper.cpp como única via. Hoje o código paga o custo de manutenção sem entregar a funcionalidade.

---

### 3.2 🟠 Alto

#### A1 — `previewCache` cresce sem limite e os arquivos de preview nunca são apagados

[electron/ipc/preview-handlers.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/electron/ipc/preview-handlers.js:17)

```js
const previewCache = new Map(); // `${url}|${quality}` -> { path, time }
```

- Não há `MAX_ENTRIES` nem varredura periódica. Entradas só saem em dois casos: erro na geração (:70, :73) ou `clearPreview` explícito (:122).
- O TTL de 30 min é avaliado **apenas quando aquela mesma chave é consultada de novo** (:53). Uma URL gerada e nunca reaberta fica no `Map` para sempre.
- O valor é o caminho em `app.getPath('temp')`: o `.mp4` do preview **nunca é removido do disco**. Numa sessão longa com muitas URLs o diretório temporário só cresce.

**Proposta:** teto de entradas com evicção FIFO/LRU + `clearPreview` no despejo; limpeza de `tmp` na inicialização do app.

#### A2 — Timers de polling sem `unref()`

O projeto tem **2** ocorrências de `.unref()` (ambas em timeouts de "killer" de processo: [src/ffmpeg/service/run.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/ffmpeg/service/run.js:79), [src/transcribe/whisper-cpp/spawn.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/transcribe/whisper-cpp/spawn.js:64)) e **nenhum** `setInterval` com `unref()`:

| Arquivo | Linha | Uso |
|---|---|---|
| [electron/clipboard-watcher.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/electron/clipboard-watcher.js:31) | 31 | polling do clipboard |
| [electron/renderer/queue-dashboard.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/electron/renderer/queue-dashboard.js:82) | 82 | refresh do dashboard |
| [src/transports/backends/hls-segments/downloader/adaptive.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/transports/backends/hls-segments/downloader/adaptive.js:49) | 49 | ajuste de concorrência |
| [src/transports/backends/dash-segments/index.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/transports/backends/dash-segments/index.js:92) | 92 | progresso DASH |
| [src/transports/range/download/pool.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/transports/range/download/pool.js:94) | 94 | progresso do pool |
| [src/transcribe/whisper-cpp/transcribe.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/transcribe/whisper-cpp/transcribe.js:80) | 80 | timeout de 4 h |

- Todos os `setInterval` têm o `clearInterval` correspondente — o pareamento está correto. O problema é que, **enquanto ativos**, seguram o event loop.
- Este é exatamente o mecanismo que travava o teste de integração corrigido na rodada anterior (`server.close()` sem `closeAllConnections()` + handle pendente). O mesmo padrão continua no produto.

**Proposta:** `.unref()` nos `setInterval` de progresso/polling (não nos que são a única razão de o processo viver) e nos timeouts longos.

#### A3 — APIs de encerramento existem e nunca são chamadas

| API definida | Onde | Quem chama |
|---|---|---|
| `clipboardWatcher.dispose()` | [electron/clipboard-watcher.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/electron/clipboard-watcher.js:111) | **ninguém** |
| `notifier.dispose()` | [electron/notifications/controller.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/electron/notifications/controller.js:63) | **ninguém** |
| `curlTransport.dispose()` | [src/transports/curl/transport/index.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/transports/curl/transport/index.js:55) | **ninguém** |

Só existem 2 chamadas de `dispose()` no projeto: `queue.dispose()` em [electron/services.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/electron/services.js:106) e `engine.dispose()` em [src/core/registry.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/core/registry.js:119).

E o handler de saída ([electron/main/bootstrap.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/electron/main/bootstrap.js:33)) faz só isso:

```js
app.on('before-quit', () => {
  try { services?.queue.save(); } catch { /* ignora */ }
});
```

Faltam no shutdown: parar o `clipboardWatcher`, dar `flush` no `notifier` (as notificações pendentes na janela de agregação de 5 s são perdidas), cancelar downloads curl em andamento e persistir settings.

**Proposta:** um `services.shutdown()` único chamado no `before-quit`, com timeout curto e `event.preventDefault()` + `app.quit()` após finalizar (padrão para shutdown assíncrono no Electron).

#### A4 — `preload.cjs` expõe 10 listeners IPC sem contrapartida de remoção

[electron/preload.cjs](C:/Users/Kaique%20Dias/Downloads/streamgrab/electron/preload.cjs)

- 10 métodos do tipo `onQueueEvent`, `onClipboardDetected`, `onBatchProgress`, `onTranscribe*` registram via `ipcRenderer.on` e **não retornam função de unsubscribe**.
- `rg "removeListener|removeAllListeners"` em `electron/`: **zero resultados**.
- Hoje isso não vaza, porque cada um é registrado uma única vez no bootstrap ([electron/renderer/batch-dialog/dialog.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/electron/renderer/batch-dialog/dialog.js:9) tem até comentário confirmando a intenção). Mas o contrato não existe: se qualquer painel for reinicializado, `ipcRenderer.on` acumula e o handler roda N vezes por evento — sintoma clássico de "duplica o item na fila" e "notificação repetida".

**Proposta:** fazer cada `on*` retornar `() => ipcRenderer.removeListener(channel, handler)` e documentar isso na API do preload. É uma mudança pequena e preventiva.

---

### 3.3 🟡 Médio

#### M1 — Escrita atômica sem `fsync` e sem retry para `EPERM`/`EBUSY`

[src/core/storage.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/core/storage.js:28)

```js
fs.writeFileSync(tmp, text, 'utf8');
fs.renameSync(tmp, file);
```

- O design (tmp + rename no mesmo volume) está correto e é uma boa decisão — vale registrar.
- Faltam dois detalhes de robustez: (a) sem `fsync` no arquivo e no diretório antes do rename, um crash de energia pode deixar o `.tmp` vazio renomeado por cima do arquivo bom; (b) no Windows, `renameSync` sobre arquivo aberto por antivírus/OneDrive falha com `EPERM`/`EBUSY` de forma intermitente, e hoje isso propaga como exceção para quem chamou `save()`.
- `settings.set()`/`update()` ([src/core/settings/store.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/core/settings/store.js)) fazem `store.save()` a cada chave — ou seja, qualquer mudança de configuração é exatamente esse caminho, sem debounce.

**Proposta:** retry com backoff (3 tentativas) em `EPERM`/`EBUSY`/`EACCES` dentro de `atomicWriteFileSync`, e agrupamento com debounce em `settings.set`.

#### M2 — Diretório temporário órfão quando a extração de áudio falha

[src/transcribe/audio-extract/extract.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/transcribe/audio-extract/extract.js:28)

```js
const tmpDir = outputDir || fs.mkdtempSync(path.join(os.tmpdir(), 'sg-audio-'));
...
} catch (err) {
  cleanupFileSync(audioPath);   // remove só o .wav
  throw err;
}
```

- O caminho de **sucesso** está correto: `makeCleanup` remove o `.wav` e o diretório se ele ficou vazio ([fs-helpers.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/transcribe/audio-extract/fs-helpers.js:33)), e [src/transcribe/api/video.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/transcribe/api/video.js:93) chama `await cleanup()` num `finally` — verificado.
- O caminho de **erro** deixa o diretório `sg-audio-*` no `%TEMP%` para sempre (vídeo sem áudio, ffmpeg quebrado, cancelamento).

**Proposta:** no `catch`, remover `tmpDir` quando ele foi criado aqui (`tmpDir !== outputDir`).

#### M3 — Feature inteira de download em partes está órfã (~19 arquivos)

Nenhum arquivo de `src/cli/file-download*` ou `src/cli/file-planner.js` tem consumidor: nem entrypoint, nem outro módulo de produção, **nem teste**, nem script, nem doc. A varredura de referências cruzadas só encontra os próprios arquivos entre si.

- Entrypoints confirmados: `src/index.js` conhece apenas `help`, `analyze`, `download` e a sessão interativa ([src/cli/commands.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/cli/commands.js) exporta 7 símbolos, nenhum de file-download).
- Inalcançáveis: `src/cli/file-download.js`, `src/cli/file-download/` (6), `src/cli/file-download-parts.js`, `src/cli/file-download-parts/` (8), `src/cli/file-download-prompt.js`, `src/cli/file-download-shared.js`, `src/cli/file-planner.js` e [src/transports/file-probe.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/transports/file-probe.js).

**Isso requer decisão sua** — ver seção 4. Não classifiquei como "lixo" porque pode ser uma feature planejada.

#### M4 — `kill()` sem árvore e `timeoutMs` sem default no client curl

[src/curlimp/active.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/curlimp/active.js:7) e [src/transports/curl/transport/index.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/transports/curl/transport/index.js:49)

```js
child.kill();                      // SIGTERM, sem /T
```

- O rastreamento de processos está bem feito: `registerActive` por transporte (:28), `delete` no `close`/`error` ([client.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/curlimp/client.js:68)), então não há vazamento de referência.
- `kill()` sem `/T` funciona porque `curl-impersonate.exe` é o processo direto — mas quebra no dia em que o comando virar um `.cmd`/wrapper.
- [src/curlimp/client.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/curlimp/client.js:33) usa `timeoutMs` sem default; `run()` chamado sem o terceiro argumento produz `Math.max(15, NaN)` → `NaN` → `--max-time NaN`. Hoje todos os chamadores passam valor, então é latente.

**Proposta:** `timeoutMs = 90000` como default na própria função `run`; `{ force: true }` no `kill` e `taskkill /T` no Windows quando o comando não for `.exe` direto.

#### M5 — Cadeias de barrel redundantes

| Cadeia | Arquivos |
|---|---|
| `src/core/queue/index.js` → `queue.js` → `queue/index.js` | 3 hops para chegar em `createDownloadQueue` ([src/core/queue/index.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/core/queue/index.js:5)) |
| `src/core/download-plan.js` (usado) e `src/core/download-plan/index.js` (barrel duplicado, inalcançável) | 2 barrels para a mesma API |

Consequência do padrão de refactor adotado (barrel no caminho antigo + diretório novo): em alguns casos o barrel antigo aponta para outro barrel. Funciona, mas cria um hop extra em módulos carregados em caminho quente e confunde quem procura a implementação.

**Proposta:** achatar — `src/core/queue/index.js` deve reexportar direto de `./queue/index.js`.

---

### 3.4 ⚪ Baixo

#### B1 — 35 imports/variáveis não usados (tabela completa)

| Arquivo:linha | Item |
|---|---|
| [electron/ipc/app-handlers.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/electron/ipc/app-handlers.js:7) | `BrowserWindow` |
| [electron/ipc/history-handlers.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/electron/ipc/history-handlers.js:6) | `app` |
| electron/ipc/history-handlers.js:7 | `loadConfig` |
| electron/ipc/history-handlers.js:15 | `PROJECT_ROOT` |
| [electron/renderer/panel-transcribe-model.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/electron/renderer/panel-transcribe-model.js:18) | `LIST_ID`, `SELECT_ID`, `HINT_ID` |
| [electron/renderer/queue-dashboard.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/electron/renderer/queue-dashboard.js:13) | `renderProgress` |
| [electron/renderer/video-tabs/tab-lifecycle.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/electron/renderer/video-tabs/tab-lifecycle.js:3) | `markAllPreviousAsDone`, `setActiveStep` |
| [scripts/install-whisper.mjs](C:/Users/Kaique%20Dias/Downloads/streamgrab/scripts/install-whisper.mjs:361) | `autoInstallDeps` |
| [src/adapters/ytdlp/download-plan.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/adapters/ytdlp/download-plan.js:42) | `headers`, `auth` |
| [src/cli-flow/index.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/cli-flow/index.js:10) | `normalizeUrl`, `applyProviderHeaders` |
| [src/cli/curl-flow.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/cli/curl-flow.js:4) | `CurlImpersonateTransport`, `isMdstrmUrl` |
| [src/cli/download/mux-multi.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/cli/download/mux-multi.js:16) / [muxed.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/cli/download/muxed.js:12) | `totalBytes` |
| [src/core/engine/executor/strategies.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/core/engine/executor/strategies.js:34) | `prepareHlsSegments`, `prepareDashSegments`, `ffmpegStartDownload`, `ffmpegStartMuxDownload`, `curlTransportResolver` |
| [src/core/engine/runners/curl-hls.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/core/engine/runners/curl-hls.js:19) | `onLog` |
| [src/core/engine/runners/dash-segments.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/core/engine/runners/dash-segments.js:18) | `ffmpegStartDownload` |
| [src/core/models/download-job.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/core/models/download-job.js:14) | `jobSequence` |
| [src/transports/backends/dash-segments/index.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/transports/backends/dash-segments/index.js:11) | `resolveAbsolute` |
| tests/… | `keyinfo`, `out` ×2, `parsePlaylistText`, `ForbiddenError`, `url` ×2 |

Verifiquei os dois casos que pareciam perda de funcionalidade e **não são**:
- `dash-segments.js:18` — `ffmpegStartDownload` é apenas um ponto de injeção morto; o caminho `single` usa `fs.promises.copyFile` e o `mux` usa `startMuxDownload`. Nenhum fallback foi perdido.
- `curl-flow.js:4,6` — o transporte vem de `resolveTransportWithAutoInstall()` e o tratamento de mdstrm está em `safeRefreshMdstrm()`. São imports que sobraram do refactor, não código removido por engano.

#### B2 — Config de lint gera 184 dos 305 warnings em `scripts/`

`no-console` → 213 ocorrências: **184 em `scripts/`**, 25 em `tests/`, **4 em `src/`**.

`console.log` é a saída legítima de um script de CLI (`install-whisper.mjs`, `transcribe-interactive.mjs`, `test-transcribe.mjs`). A regra ([eslint.config.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/eslint.config.js:28)) se aplica a todo `**/*.js` sem exceção para scripts.

**Proposta:** desligar `no-console` para `scripts/**` e `tests/**`, mantendo em `src/` e `electron/`. Isso limpa 209 dos 305 warnings sem tocar em código — e faz os 4 de `src/` virarem sinal real em vez de ruído.

#### B3 — Complexidade acima do limite em 36 funções

Limite configurado: 25. Top ofensores verificados no relatório do lint:

| Complexidade | Local |
|---|---|
| 58 | [electron/media-info/normalize.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/electron/media-info/normalize.js:46) |
| 50 | [src/core/engine/executor/strategies.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/core/engine/executor/strategies.js:71) |
| 49 | [src/transports/backends/dash-segments/index.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/transports/backends/dash-segments/index.js:17) |
| 49 | [src/transports/range/chunk.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/transports/range/chunk.js:24) |
| 43 | [electron/security-payloads-download.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/electron/security-payloads-download.js:33) |
| 42 | [src/cli-flow/parse-flags.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/cli-flow/parse-flags.js:12) |
| 42 | [src/core/engine/runners/subtitles.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/core/engine/runners/subtitles.js:24) |
| 42 | [src/transports/ytdlp-runner.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/transports/ytdlp-runner.js:41) |

Observação relevante: `max-lines-per-function: 150` está configurado e produz **zero** avisos — o refactor de tamanho foi efetivo. A dívida que sobrou é de **complexidade ciclomática**, que é o próximo eixo natural (funções pequenas com muitos `if/else` aninhados). `electron/media-info/normalize.js` é o melhor candidato: complexidade 58 numa única função de normalização, testável por tabela.

#### B4 — Dynamic imports repetidos em caminho de preview

[electron/ipc/preview-handlers.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/electron/ipc/preview-handlers.js:38)

- Cada chamada de `preview:generate` executa 4 `await import()` (`electron`, `src/preview.js`, `src/ffmpeg/service.js`, `src/ffmpeg/muxer.js`) + `loadConfig(PROJECT_ROOT, …)` síncrono lendo arquivo do disco. O cache de módulo torna o import barato, mas o `loadConfig` síncrono em handler IPC bloqueia o event loop a cada preview.

**Proposta:** imports estáticos no topo e config carregada uma vez (ou cacheada com invalidação), não por request.

Sobre `argv: ['--hotmart']` (:82): verifiquei [src/cli/config/hotmart.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/cli/config/hotmart.js:41) — os headers só entram se `isHotmartUrl(url)` for verdadeiro, então **não** há injeção de headers em URLs de outros provedores. É intenção fixa no código, não bug; vale um comentário explicando por que o preview sempre se comporta "como se `--hotmart` tivesse sido passado".

#### B5 — Código alcançável apenas por testes

| Área | Arquivos | Usado por |
|---|---|---|
| `src/legacy/youtube/` | 11 | [tests/unit/legacy-youtube.test.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/tests/unit/legacy-youtube.test.js) |
| `src/legacy/youtube-signature/` | 5 | [tests/e2e/curl-e2e.mjs](C:/Users/Kaique%20Dias/Downloads/streamgrab/tests/e2e/curl-e2e.mjs) |
| [src/adapters/social.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/adapters/social.js), [src/adapters/youtube.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/adapters/youtube.js) | 2 | **ninguém** |
| scripts `update-ytdlp.mjs`, `package-resources.mjs` | 2 | apenas testes |

Os `legacy/*` são mantidos vivos artificialmente pelos testes: se a decisão for remover a lógica antiga, os testes precisam sair junto (senão o CI perpetua o legado). Os 2 adapters não têm nenhum consumidor — são os candidatos mais seguros a remoção.

#### B6 — Parâmetros de injeção mortos em `strategies.js`

[src/core/engine/executor/strategies.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/core/engine/executor/strategies.js:34) — 5 parâmetros da desestruturação (`prepareHlsSegments`, `prepareDashSegments`, `ffmpegStartDownload`, `ffmpegStartMuxDownload`, `curlTransportResolver`) não são usados no corpo. Quem injeta por eles acredita estar mudando comportamento e não muda nada. É o tipo de assinatura que engana teste (passa um mock, o código real roda).

**Proposta:** remover os parâmetros (e os `_` prefixados) ou usá-los de fato.

#### B7 — Mojibake em cabeçalhos de arquivos

Trechos como `â€”` (—) e `Ã§` (ç) aparecem em comentários de arquivos criados/refatorados ao longo do projeto (ex.: [src/core/queue/queue.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/core/queue/queue.js:2), [electron/main/index.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/electron/main/index.js:2)). Não afeta execução; afeta leitura e qualquer busca por texto acentuado.

**Proposta:** normalizar os comentários num commit `chore: corrige encoding de comentários` (sem tocar em strings de UI).

---

## 4. Itens que requerem sua decisão

Não são bugs — são decisões de produto que mudam o que fazer com o código.

1. **`src/cli/file-download*` + `file-planner.js` (~19 arquivos)**: feature planejada ou resíduo? Se resíduo → remover junto com `transports/file-probe.js`. Se planejada → falta wire no dispatcher de [src/index.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/index.js:36) e cobertura de teste.
2. **`@xenova/transformers`**: declarar `optionalDependencies` ou remover o backend `whisper-transformers/`?
3. **`src/legacy/youtube*` (16 arquivos)**: a lógica antiga ainda tem valor de referência ou pode sair com seus testes?
4. **`src/adapters/social.js` e `src/adapters/youtube.js`**: remover? Nenhum consumidor em produção hoje.

---

## 5. Priorização sugerida

| Ordem | Item | Esforço | Ganho |
|---|---|---|---|
| 1 | C1 — `.catch` no boot + log em arquivo | ~30 min | transforma "app não abre" em mensagem acionável |
| 2 | B2 — escopo do `no-console` | ~5 min | 305 → ~96 warnings; lint volta a ser sinal |
| 3 | A3 — `shutdown()` no `before-quit` | ~1 h | encerra watcher/notifier/curl, não perde notificação pendente |
| 4 | A2 — `.unref()` nos timers de polling | ~20 min | elimina a classe de bug que travava os testes |
| 5 | A4 — unsubscribe no `preload.cjs` | ~1 h | remove risco latente de handler duplicado |
| 6 | A1 — teto + limpeza do `previewCache` | ~1 h | disco e memória previsíveis em sessão longa |
| 7 | M1 — retry em `rename` no Windows | ~30 min | settings/fila param de falhar por AV/OneDrive |
| 8 | M2 — limpar `tmpDir` no `catch` | ~10 min | fim do lixo em `%TEMP%` |
| 9 | B1/B6 — remover imports e params mortos | ~1 h | menos ruído, menos API enganosa |
| 10 | B3 — quebrar `media-info/normalize.js` | ~2 h | complexidade 58 → funções pequenas testáveis |
| 11 | Decisões da seção 4 | — | bloqueia a limpeza profunda |

---

## 6. Apêndice — como reproduzir cada medição

```powershell
# lint estruturado por regra
node .\node_modules\eslint\bin\eslint.js . -f json > .git\lint.json

# baseline de testes
npm run test:unit ; npm run test:integration ; npm run test:e2e

# timers sem unref
rg -n "setInterval|\.unref\(\)" src electron --glob '!node_modules'

# listeners IPC sem unsubscribe
rg -n "ipcRenderer\.on|removeListener|removeAllListeners" electron --glob '!node_modules'

# dependências usadas e não declaradas
# (script ad-hoc: varre especificadores de import e compara com package.json)

# alcançabilidade a partir dos entrypoints
# (script ad-hoc: BFS em import/require/import() a partir de
#  src/index.js, electron/main/index.js e electron/preload.cjs)
```

---

**Conclusão:** a base está saudável — 0 erros de lint, suite verde, nenhum arquivo acima de 150 linhas, escrita de dados já atômica e tratamento de cancelamento correto em pontos-chave ([src/transports/range/chunk.js](C:/Users/Kaique%20Dias/Downloads/streamgrab/src/transports/range/chunk.js:24) é o melhor exemplo: `AbortController` + timer + `removeEventListener` no `finally`). Os problemas que restam são de **ciclo de vida e encerramento** (timers, processos, caches, listeners) e de **código que sobrou de refactors anteriores** — nenhum exige refactor estrutural, e todos os itens 🔴/🟠 cabem em mudanças cirúrgicas.