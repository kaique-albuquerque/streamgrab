# Spec: Formato de Contêiner Configurável (MP4 / MKV)

> **ID:** SPEC-11
> **Status:** Rascunho aprovado para planejamento
> **Prioridade:** Média
> **Impacto:** 🔥🔥
> **Esforço:** Médio

---

## 1. Objetivo

Permitir que o usuário escolha, na tela de **Configurações**, o **formato do
contêiner** dos vídeos baixados — `MP4` (padrão atual) ou `MKV` — e que essa
escolha valha para todos os downloads seguintes, na GUI e na CLI.

**Motivação real:** o app hoje entrega **sempre MP4** para HLS/DASH/mux
(`extensionFor` força `.mp4`). O usuário que quer legenda **como faixa
selecionável** (soft subs) precisa de MKV, porque o caminho de `--embed-subs`
atual re-encodeia para MP4 e **sobrescreve o `.mkv` com conteúdo MP4**,
corrompendo o arquivo.

---

## 2. Comportamento Atual (verificado no código)

### 2.1. O formato é `.mp4` hardcoded em vários pontos

| Local | Linha | Comportamento |
|-------|-------|---------------|
| `src/core/engine/lifecycle/extension.js` | 26 | `mux`/`mux-multi` → `.mp4` |
| `src/core/engine/lifecycle/extension.js` | 28 | `hls`/`dash` → `.mp4` |
| `src/core/engine/lifecycle/extension.js` | 33–35 | sem extensão na URL → `.mp4` |
| `src/transports/ytdlp-runner.js` | 54 | `mergeOutputFormat: 'mp4'` |
| `src/core/engine/runners/mux.js` | 20, 77 | `videoTmp = 'video.mp4'` (temp, indiferente) |
| `src/core/engine/runners/mux.js` | 115 | `-movflags +faststart` (`runMuxMultiDownload`) |
| `src/core/engine/runners/subtitles.js` | 98 | `tmpOutput = videoPath + '.subbed.mp4'` |
| `src/core/engine/runners/subtitles.js` | 95–96 | `-c:v libx264` + `-movflags +faststart` |
| `src/core/filenames.js` | 51, 78 | `ensureExtension(name, ext = '.mp4')` |
| `src/ffmpeg/muxer.js` | 85 | `-movflags +faststart` em `buildMuxArgs` |
| `src/ffmpeg/muxer.js` | 23 | `MODES[2]` fallback `aac` com `-movflags` (usado por `single-mode.js`) |
| `src/cli/download/mux-multi-args.js` | 35 | `-movflags +faststart` (`buildMuxMultiArgs`) |

São **quatro** emissores independentes de `-movflags`: `buildMuxArgs`,
`MODES[2]`, `runMuxMultiDownload` e `buildMuxMultiArgs`. Todos precisam respeitar
o contêiner — esquecer um produz log mentiroso e comportamento inconsistente
entre GUI e CLI.

Não há setting de formato: `DEFAULT_SETTINGS` só tem `defaultQuality` (qualidade,
não contêiner).

### 2.2. Estado do suporte a MKV hoje (testado)

| Operação | MP4 | MKV | Evidência |
|---|---|---|---|
| Download HLS/DASH | ✅ | não oferecido | `extensionFor` força `.mp4` |
| Mux (vídeo+áudio) | ✅ | ✅ funciona | `ffmpeg -c copy -movflags +faststart out.mkv` → `matroska,webm`; `-movflags` é ignorado em MKV |
| Transcrição (whisper) | ✅ | ✅ funciona | `extractAudio` usa `-i videoPath` (ffmpeg autodetecta); `hasAudio` e `getAudioDuration` OK; saída `video.transcription.{txt,md,srt}` |
| Extração de áudio (P13) | ✅ | ✅ funciona | `extractAudioFile` com MKV → `{audioPath: '.../x.m4a', transcoded: false}` |
| `--embed-subs` (hardcode) | ✅ | ❌ **corrompe** | `writeFileSync` do MP4 re-encodado sobre o `.mkv` original: `format_name = "mov,mp4,m4a,3gp,3g2,mj2"` |

**Conclusão:** adicionar MKV **não** quebra transcrição nem extração de áudio.
O único ponto incompatível é o `--embed-subs` hardcoded.

---

## 3. Comportamento Desejado

### 3.1. UI — Configurações

Novo campo na tela de Configurações, depois de "Qualidade padrão":

```
┌──────────────────────────────────────────────────────────┐
│ Formato do vídeo:                                        │
│   [ MP4 (compatível) ▾ ]                                 │
│     • MP4 — compatível com qualquer player/tela          │
│     • MKV — permite legenda como faixa selecionável     │
└──────────────────────────────────────────────────────────┘
```

- `select` com `data-setting="videoContainer"`, opções `mp4` e `mkv`.
- Default: `mp4` (preserva o comportamento atual de quem já usa o app).
- Um `<p class="hint-line">` explica a diferença em uma linha.
- Salvar usa o fluxo existente (`settingsSaveBtn` → `settings:update`).

### 3.2. Efeito no download

Com `videoContainer: 'mkv'`:

| Estratégia | Resultado |
|---|---|
| `mux` / `mux-multi` (HLS/DASH/YouTube adaptativo) | arquivo final `.mkv` com `-c copy` (sem re-encode) |
| `hls`/`dash` com segmentos | `.mkv` |
| URL direta com extensão na URL | mantém a extensão da URL (decisão existente) |
| URL direta sem extensão | `.mkv` |
| yt-dlp (YouTube/social) | `mergeOutputFormat: 'mkv'` |

Com `videoContainer: 'mp4'`: comportamento idêntico ao de hoje.

### 3.3. Efeito nas features dependentes

| Feature | Com MKV |
|---|---|
| **Transcrição** | funciona sem mudança (já validado) |
| **Extração de áudio** | funciona sem mudança (já validado) |
| **`--embed-subs`** | **precisa mudar** — ver 3.4 |
| **Preview** | precisa tocar o arquivo baixado? Não — preview usa o stream da URL, não o arquivo. Sem impacto. |
| **"Abrir arquivo" / "Mostrar na pasta"** | sem impacto (path-agnóstico) |
| **Histórico** | registra o path final; sem impacto |

### 3.4. `--embed-subs` com MKV

Duas opções, com trade-offs:

**(A) Soft subs (recomendado para MKV):** adiciona a legenda como **faixa** no
container, sem re-encode:

```bash
ffmpeg -i video.mkv -i legenda.srt -c:v copy -c:a copy -c:s srt \
  -metadata:s:s:0 language=pt output.mkv
```

- Vantagens: instantâneo (sem re-encode), legenda alternável, qualidade intacta.
- Requer container compatível: **MKV sim, MP4 com restrição** (MP4 só aceita
  `mov_text`, o que exige transcode da legenda, não do vídeo).

**(B) Hardcode (comportamento atual):** queima a legenda no vídeo. Funciona em
qualquer container, mas re-encoda e **não pode sobrescrever o `.mkv` com MP4**.

**Decisão da spec:** o `--embed-subs` passa a respeitar o contêiner de destino:

- **MP4:** mantém o hardcode atual (`libx264` + `movflags`), porque MP4 não
  suporta `srt` como faixa de forma universal.
- **MKV:** usa **soft subs** (`-c:v copy -c:s srt`), sem re-encode.
- **Se o soft-sub MKV falhar:** fallback para salvar o `.srt` ao lado
  (o mesmo fallback que já existe hoje quando o embed falha).

Isso corrige o bug de corrupção **e** melhora o resultado.

### 3.5. CLI

Nova flag:

```bash
streamgrab download <url> --container mkv
streamgrab download <url> --container mp4   # explícito (default)
```

- Sem a flag: usa o setting (`videoContainer`).
- A flag **sobrescreve** o setting para aquele download.

---

## 4. Contrato das interfaces

### 4.1. Setting

```json
{ "videoContainer": "mp4" }
```

| Chave | Tipo | Default | Valores |
|-------|------|---------|---------|
| `videoContainer` | string | `mp4` | `mp4`, `mkv` |

- `DEFAULT_SETTINGS.videoContainer = 'mp4'`
- `SCHEMA.videoContainer = { type: 'string', clamp: null }`
- `SETTINGS_KEYS` em `electron/security-payloads-queue/settings.js` +
  validação `['mp4','mkv'].includes(value)`

### 4.2. API interna (novo módulo)

`src/core/engine/lifecycle/container.js`

```js
export const CONTAINERS = ['mp4', 'mkv'];
export const DEFAULT_CONTAINER = 'mp4';

/** Normaliza 'MP4'/'mkv'/'' → 'mp4'|'mkv' (desconhecido → default). */
export function normalizeContainer(value) → 'mp4' | 'mkv'

/** Extensão do contêiner: 'mp4' → '.mp4', 'mkv' → '.mkv'. */
export function extensionForContainer(container) → string

/** Args do FFmpeg específicos do contêiner (ex.: movflags só em mp4). */
export function containerOutputArgs(container) → string[]
//  mp4 → ['-movflags', '+faststart']
//  mkv → []
```

### 4.3. Mudanças em `extensionFor`

```js
// antes
export function extensionFor(prepared, sourceType) { ... return '.mp4' }

// depois
export function extensionFor(prepared, sourceType, container = DEFAULT_CONTAINER) { ... }
// mux/mux-multi/hls/dash/sem-extensão → extensionForContainer(container)
// URL direta COM extensão → mantém a extensão da URL (comportamento atual)
```

Chamar com o setting resolvido em `resolveOutput`:

```js
const container = normalizeContainer(
  job.meta?.container || engine.settings?.get?.('videoContainer'),
);
const ext = extensionFor(prepared, job._sourceType || job.meta?.sourceType, container);
```

### 4.4. Propagação do container

O container escolhido precisa chegar aos runners que montam o FFmpeg:

| Ponto | Como recebe |
|---|---|
| `resolveOutput` | lê o setting / `job.meta.container` |
| `runMuxDownload(prepared, output, ...)` | deriva de `path.extname(output)` (já recebe `output`) |
| `runMuxMultiDownload` | idem |
| `runTurboMuxDownload` | deriva de `output` |
| `runYtDlpDownload` | novo parâmetro `mergeOutputFormat`, derivado de `output` |
| `embedSubtitles` | deriva de `path.extname(videoPath)` |
| `buildMuxArgs` | usa `containerOutputArgs(container)` |

**Princípio:** `output` é a fonte de verdade da extensão. Os runners derivam o
container de `path.extname(output)` em vez de receber mais um parâmetro pela
cadeia — menos mudanças, menos chance de divergência.

### 4.5. IPC

Nenhum canal novo. `settings:update` já cobre `videoContainer` (após entrar em
`SETTINGS_KEYS`). O payload de `queue:enqueue` ganha um campo opcional:

```js
{ ..., container: 'mp4' | 'mkv' | '' }  // '' = usa o setting
```

Validação em `electron/security-payloads-queue/queue-enqueue.js`.

---

## 5. Segurança

- `videoContainer` é sempre validado contra allowlist (`mp4`, `mkv`) — nunca
  vira parte de caminho nem de argumento cru do FFmpeg.
- A extensão segue sendo derivada de `fileName`/`container` controlados pelo
  app, nunca do valor bruto do IPC (`normalizeContainer` + `extensionForContainer`).
- `-movflags +faststart` só em MP4 (em MKV é ignorado — não é risco, mas
  emitir é confuso nos logs).
- `embedSubtitles` **nunca** pode gravar MP4 sobre um path `.mkv` (é o bug atual).

---

## 6. Testes exigidos

| Teste | O que prova |
|-------|-------------|
| `normalizeContainer` aceita `mp4`/`mkv` e cai em `mp4` para lixo | Allowlist funciona |
| `extensionFor(..., 'mkv')` devolve `.mkv` para mux/hls/dash | Extensão respeita o container |
| `extensionFor` mantém extensão da URL direta mesmo com container `mkv` | Não quebra downloads diretos |
| `containerOutputArgs('mp4')` tem `-movflags +faststart`; `('mkv')` não | Args corretos por container |
| `resolveOutput` respeita o setting `videoContainer` | Setting chega ao nome |
| `resolveOutput` respeita `job.meta.container` (override por job) | Override do lote/flag |
| `buildMuxArgs` com `.mkv` não emite `-movflags` | Mux correto |
| `runYtDlpDownload` com output `.mkv` usa `mergeOutputFormat: 'mkv'` | yt-dlp correto |
| `embedSubtitles` com `.mkv` **não** sobrescreve com MP4 | Bug de corrupção corrigido |
| `embedSubtitles` com `.mkv` usa `-c:v copy -c:s srt` | Soft subs |
| `embedSubtitles` com `.mp4` mantém hardcode | Comportamento preservado |
| `validateSettingsPayload` aceita `videoContainer: 'mkv'` e rejeita `'avi'` | Allowlist no IPC |
| `core-settings.test.js` lista de chaves inclui `videoContainer` | Caracterização atualizada |
| CLI `--container mkv` chega ao `job.meta.container` | Flag funciona |
| Setting default `mp4` preserva comportamento de hoje | Sem regressão |

---

## 7. Critérios de conclusão

- [ ] Menu "Formato do vídeo" na tela de Configurações (MP4/MKV), persiste ao salvar
- [ ] Download de HLS/DASH/mux gera `.mkv` quando o setting é `mkv`
- [ ] Download de HLS/DASH/mux gera `.mp4` quando o setting é `mp4` (sem regressão)
- [ ] yt-dlp respeita o container
- [ ] Transcrição funciona com arquivo `.mkv` (já funciona; teste de regressão)
- [ ] Extração de áudio funciona com `.mkv` (já funciona; teste de regressão)
- [ ] `--embed-subs` com MKV usa soft subs e **não corrompe** o arquivo
- [ ] `--embed-subs` com MP4 mantém o hardcode atual
- [ ] CLI `--container mkv`
- [ ] `npm test` e `npm run lint` passam
- [ ] Nenhum arquivo acima de ~150 linhas
- [ ] README documenta o setting e a flag

---

## 8. Não-objetivos

- **MKV com hardcode de legenda** (queimar legenda em MKV) — usa soft subs.
- **Outros contêineres** (`webm`, `mov`, `avi`) nesta versão — o catálogo é
  extensível (`CONTAINERS`), mas a UI expõe só MP4 e MKV.
- **Escolher codecs** (h264/h265/av1) — fora de escopo.
- **Reencodar vídeo ao converter MP4→MKV** — não há conversão; o container é
  escolhido no download, não depois.
- **Migrar downloads antigos** — arquivos já baixados ficam como estão.