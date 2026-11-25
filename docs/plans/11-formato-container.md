# Plano de Implementação — Formato de Contêiner Configurável (MP4 / MKV)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Origem:** SPEC-11 — `docs/specs/11-formato-container.md`
> **Prioridade:** Média | **Esforço:** Médio | **Riscos:** Médio (toca o caminho de saída de todos os downloads)

**Goal:** Permitir que o usuário escolha MP4 ou MKV na tela de Configurações e
que a escolha valha para todos os downloads — sem re-encode, sem corromper
arquivo e sem quebrar transcrição/extração de áudio.

**Architecture:** Um módulo puro `container.js` centraliza a allowlist, a
extensão e os args de FFmpeg por contêiner. `extensionFor` passa a receber o
contêiner (default `mp4`, preservando comportamento). Os runners **derivam** o
contêiner de `path.extname(output)` — `output` continua sendo a fonte de
verdade, então não é preciso enfiar um parâmetro novo em cada função da cadeia.
`embedSubtitles` muda por contêiner: MP4 mantém hardcode; MKV usa soft subs
(`-c:v copy -c:s srt`), corrigindo a corrupção atual.

**Tech Stack:** Node 20 ESM, `node:test` + `node:assert/strict`, Electron 37,
FFmpeg (vendor/extraResources), yt-dlp.

**Spec:** `docs/specs/11-formato-container.md`

## Emendas aplicadas (revisão de viabilidade)

Duas correções incorporadas após conferência contra o código real:

| # | Onde | Problema encontrado | Emenda |
|---|------|---------------------|--------|
| 1 | Task 5 | `src/cli/download/mux-multi-args.js:35` tem `-movflags` fixo próprio (CLI) | Adicionado à Task 5 |
| 2 | Task 5 | `MODES[2]` em `src/ffmpeg/muxer.js:23` tem `-movflags` fixo e é usado por `single-mode.js` em produção | `-movflags` sai de `MODES` e entra em `buildDownloadArgs` |

Ambas são o mesmo risco: existem **quatro** emissores independentes de
`-movflags` (`buildMuxArgs`, `MODES[2]`, `runMuxMultiDownload`,
`buildMuxMultiArgs`), não um. Corrigir um e esquecer outro deixaria GUI e CLI
com comportamentos diferentes.

---

## Global Constraints

- Setting `videoContainer`: `'mp4' | 'mkv'`, default **`'mp4'`**.
- Comportamento com `mp4` deve ser **idêntico ao de hoje** — zero regressão.
- `output` é a fonte de verdade da extensão; os runners derivam dela.
- `-movflags +faststart` **só** em MP4 (omitir em MKV).
- `embedSubtitles` **nunca** pode gravar MP4 sobre um `.mkv`.
- Nenhum arquivo acima de ~150 linhas (CONTRIBUTING); ao passar, extrair
  responsabilidade e manter barrel.
- Testes em `node:test` + `node:assert/strict`; sem runner novo.
- `npm run lint` termina com **0 erros** e não aumenta o baseline de avisos
  (baseline real: 324 no worktree com o módulo de tradução; 626 na main).
- `npm run analisar:linhas` → nenhum arquivo novo acima de 150 linhas.

---

## Review Focus

1. **Teste existente de `resolveOutput` usa `settings: { get: () => dir }`**
   (`tests/unit/batch-names.test.js:26`): `get('videoContainer')` devolve o
   diretório. Esperado: `normalizeContainer(<path>)` cai em `'mp4'` e o teste
   **não muda**. Se precisar editar esse teste, a implementação vazou.
2. **URL direta com extensão própria** (`video.ts`): escolher `mkv` **não** deve
   renomear para `.mkv`. Esperado: `extensionFor` mantém a extensão da URL
   quando ela existe; o setting só governa os casos sem extensão/mux/HLS/DASH.
3. **`-movflags +faststart` em MKV:** o FFmpeg ignora silenciosamente, mas o
   log fica mentiroso. Esperado: `containerOutputArgs('mkv')` devolve `[]`.
4. **`embedSubtitles` com `.mkv`:** hoje faz `rename('x.mkv.subbed.mp4', 'x.mkv')`
   → arquivo `.mkv` com conteúdo MP4. Esperado: soft subs
   (`-c:v copy -c:a copy -c:s srt`) e o arquivo continua Matroska. Se o soft-sub
   falhar, fallback para `.srt` ao lado (nunca sobrescrever com MP4).
5. **`embedSubtitles` com `.mp4`:** deve manter `libx264` + `-movflags
   +faststart` (hardcode). Trocar para soft subs em MP4 exigiria `mov_text` e
   mudaria o comportamento atual — não fazer.
6. **yt-dlp com `mergeOutputFormat`:** hoje é `'mp4'` fixo. Com output `.mkv`
   deve ser `'mkv'`, senão o yt-dlp junta em MP4 e entrega `.mkv` com conteúdo
   MP4 (mesma classe do bug 4).
7. **Batch / fila:** `job.meta.container` (override por job) tem prioridade
   sobre o setting; `''`/ausente usa o setting.
8. **`resolveOutput` chamado duas vezes no mesmo job** (reserva + retomada):
   não pode gerar duas extensões diferentes se o setting mudar no meio — o
   `job.meta.container` deve ser fixado no primeiro uso.

---

### Task 1: Módulo `container.js` puro

**Files:**
- Create: `src/core/engine/lifecycle/container.js`
- Test: `tests/unit/container.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `CONTAINERS = ['mp4', 'mkv']`; `DEFAULT_CONTAINER = 'mp4'`;
  `normalizeContainer(value)` → `'mp4' | 'mkv'`; `extensionForContainer(container)`
  → `'.mp4' | '.mkv'`; `containerOutputArgs(container)` → `string[]`.

- [ ] **Step 1: Escrever os testes**

```js
// tests/unit/container.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTAINERS, DEFAULT_CONTAINER, normalizeContainer,
  extensionForContainer, containerOutputArgs,
} from '../../src/core/engine/lifecycle/container.js';

test('normalizeContainer aceita mp4/mkv em qualquer caixa', () => {
  assert.equal(normalizeContainer('mp4'), 'mp4');
  assert.equal(normalizeContainer('MKV'), 'mkv');
  assert.equal(normalizeContainer(' mkv '), 'mkv');
});

test('normalizeContainer cai em mp4 para lixo, vazio e nao-string', () => {
  assert.equal(normalizeContainer('avi'), 'mp4');
  assert.equal(normalizeContainer(''), 'mp4');
  assert.equal(normalizeContainer(undefined), 'mp4');
  assert.equal(normalizeContainer(null), 'mp4');
  assert.equal(normalizeContainer(42), 'mp4');
  assert.equal(normalizeContainer('/home/user/Downloads'), 'mp4');
});

test('normalizeContainer nunca resolve propriedade herdada', () => {
  assert.equal(normalizeContainer('constructor'), 'mp4');
  assert.equal(normalizeContainer('__proto__'), 'mp4');
});

test('extensionForContainer devolve a extensao com ponto', () => {
  assert.equal(extensionForContainer('mp4'), '.mp4');
  assert.equal(extensionForContainer('mkv'), '.mkv');
});

test('containerOutputArgs: movflags so em mp4', () => {
  assert.deepEqual(containerOutputArgs('mp4'), ['-movflags', '+faststart']);
  assert.deepEqual(containerOutputArgs('mkv'), []);
});

test('CONTAINERS e DEFAULT_CONTAINER', () => {
  assert.deepEqual(CONTAINERS, ['mp4', 'mkv']);
  assert.equal(DEFAULT_CONTAINER, 'mp4');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/unit/container.test.js`
Expected: FAIL com `Cannot find module .../container.js`.

- [ ] **Step 3: Implementar `container.js`**

Allowlist via `Set` + `hasOwnProperty` de propósito (ids como `constructor` não
podem herdar nada). `normalizeContainer` faz `String(value).trim().toLowerCase()`
e devolve `DEFAULT_CONTAINER` para tudo fora da allowlist (inclui não-string).

- [ ] **Step 4: Rodar e ver passar, depois commit**

Run: `node --test tests/unit/container.test.js`
Expected: 6 PASS.

```bash
git add src/core/engine/lifecycle/container.js tests/unit/container.test.js
git commit -m "feat(container): modulo de formato mp4/mkv"
```

---

### Task 2: Setting `videoContainer` (defaults, schema, allowlist IPC)

**Files:**
- Modify: `src/core/settings/defaults.js`
- Modify: `electron/security-payloads-queue/settings.js`
- Modify: `tests/unit/core-settings.test.js` (caracterização — lista exata de chaves)
- Test: `tests/unit/electron-security.test.js`, `tests/unit/container-settings.test.js`

**Interfaces:**
- Consumes: `normalizeContainer` (Task 1).
- Produces: `DEFAULT_SETTINGS.videoContainer = 'mp4'`,
  `SCHEMA.videoContainer = { type: 'string', clamp: null }`,
  `'videoContainer'` em `SETTINGS_KEYS` com validação de allowlist.

- [ ] **Step 1: Rodar a caracterização como linha de base**

Run: `node --test tests/unit/core-settings.test.js`
Expected: PASS (a lista exata de chaves bate hoje).

- [ ] **Step 2: Adicionar o default e o schema**

`DEFAULT_SETTINGS` ganha `videoContainer: 'mp4'` (junto de `defaultQuality`,
antes de `audio`). `SCHEMA` ganha `videoContainer: { type: 'string', clamp: null }`.

- [ ] **Step 3: Atualizar o teste de caracterização**

`tests/unit/core-settings.test.js` faz `assert.deepEqual(Object.keys().sort(), [...])`
com a lista **exata**. Acrescentar `'videoContainer'` em ordem alfabética
(entre `'turboChunks'` e `'tutorialCompleted'`). Sem isso o teste falha.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/unit/core-settings.test.js`
Expected: PASS com a nova chave.

- [ ] **Step 5: Escrever o teste da allowlist do IPC**

```js
// tests/unit/container-settings.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSettingsPayload } from '../../electron/security-payloads-queue/settings.js';

test('videoContainer aceita mp4 e mkv', () => {
  assert.deepEqual(validateSettingsPayload({ videoContainer: 'mp4' }), { videoContainer: 'mp4' });
  assert.deepEqual(validateSettingsPayload({ videoContainer: 'MKV' }), { videoContainer: 'mkv' });
});

test('videoContainer rejeita valor fora da allowlist', () => {
  assert.equal(validateSettingsPayload({ videoContainer: 'avi' }), null);
  assert.equal(validateSettingsPayload({ videoContainer: '../../etc/passwd' }), null);
  assert.equal(validateSettingsPayload({ videoContainer: 123 }), null);
});

test('payload com chave desconhecida continua ignorado', () => {
  assert.deepEqual(validateSettingsPayload({ videoContainer: 'mkv', chaveInventada: 1 }), { videoContainer: 'mkv' });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `node --test tests/unit/container-settings.test.js`
Expected: FAIL (chave ainda não está em `SETTINGS_KEYS`).

- [ ] **Step 7: Implementar a validação**

`SETTINGS_KEYS` recebe `'videoContainer'`. No `for` de `validateSettingsPayload`,
ramo novo:

```js
} else if (key === 'videoContainer') {
  const c = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!['mp4', 'mkv'].includes(c)) return null;
  clean[key] = c;
}
```

- [ ] **Step 8: Rodar todos e commitar**

Run: `node --test tests/unit/container-settings.test.js tests/unit/core-settings.test.js tests/unit/electron-security.test.js`
Expected: PASS.

```bash
git add src/core/settings/defaults.js electron/security-payloads-queue/settings.js tests/unit/core-settings.test.js tests/unit/container-settings.test.js
git commit -m "feat(settings): chave videoContainer com allowlist mp4/mkv"
```

---

### Task 3: `extensionFor` respeitando o contêiner

**Files:**
- Modify: `src/core/engine/lifecycle/extension.js`
- Test: `tests/unit/extension-container.test.js`

**Interfaces:**
- Consumes: `extensionForContainer`, `DEFAULT_CONTAINER` (Task 1).
- Produces: `extensionFor(prepared, sourceType, container = DEFAULT_CONTAINER)`.

- [ ] **Step 1: Escrever os testes**

```js
// tests/unit/extension-container.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extensionFor } from '../../src/core/engine/lifecycle/extension.js';

test('mux respeita o container', () => {
  assert.equal(extensionFor({ strategy: 'mux' }, '', 'mp4'), '.mp4');
  assert.equal(extensionFor({ strategy: 'mux' }, '', 'mkv'), '.mkv');
});

test('mux-multi respeita o container', () => {
  assert.equal(extensionFor({ strategy: 'mux-multi' }, '', 'mkv'), '.mkv');
});

test('hls e dash respeitam o container', () => {
  assert.equal(extensionFor({ strategy: 'single' }, 'hls', 'mkv'), '.mkv');
  assert.equal(extensionFor({ strategy: 'single' }, 'dash', 'mkv'), '.mkv');
  assert.equal(extensionFor({ strategy: 'single' }, 'hls', 'mp4'), '.mp4');
});

test('URL direta COM extensao mantem a extensao dela', () => {
  assert.equal(extensionFor({ downloadUrl: 'https://x/v.ts' }, 'direct', 'mkv'), '.ts');
  assert.equal(extensionFor({ downloadUrl: 'https://x/v.webm' }, 'direct', 'mp4'), '.webm');
});

test('URL sem extensao usa o container', () => {
  assert.equal(extensionFor({ downloadUrl: 'https://x/video' }, 'direct', 'mkv'), '.mkv');
  assert.equal(extensionFor({ downloadUrl: 'https://x/video' }, 'direct', 'mp4'), '.mp4');
});

test('default (sem terceiro arg) continua mp4', () => {
  assert.equal(extensionFor({ strategy: 'mux' }), '.mp4');
  assert.equal(extensionFor({ downloadUrl: 'https://x/video' }, ''), '.mp4');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/unit/extension-container.test.js`
Expected: FAIL nos casos `mkv` (hoje sempre `.mp4`).

- [ ] **Step 3: Implementar**

Trocar os três `return '.mp4'` de mux/hls/dash/sem-extensão por
`return extensionForContainer(container)`. O caminho da URL direta COM extensão
não muda.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/unit/extension-container.test.js`
Expected: 6 PASS.

- [ ] **Step 5: Rodar o teste existente que usa `resolveOutput`/`stripForeignExtension`**

Run: `node --test tests/unit/batch-names.test.js`
Expected: PASS **sem edição** — o `fakeEngine` devolve um diretório para
`settings.get`, e `normalizeContainer(<path>)` cai em `mp4`.

```bash
git add src/core/engine/lifecycle/extension.js tests/unit/extension-container.test.js
git commit -m "feat(container): extensionFor respeita mp4/mkv"
```

---

### Task 4: `resolveOutput` lê o setting e o override do job

**Files:**
- Modify: `src/core/engine/lifecycle/output.js`
- Test: `tests/unit/output-container.test.js`

**Interfaces:**
- Consumes: `normalizeContainer` (Task 1), `extensionFor` (Task 3).
- Produces: `resolveOutput` passa a fixar `job.meta.container` no primeiro uso.

- [ ] **Step 1: Escrever os testes**

```js
// tests/unit/output-container.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveOutput } from '../../src/core/engine/lifecycle/output.js';

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'sg-out-container-')); }

function engineWith(settings, dir) {
  return { settings: { get: (k) => (k === 'videoContainer' ? settings : dir) }, _reservedOutputs: new Set() };
}

test('setting mkv gera .mkv para mux', () => {
  const dir = tmpDir();
  const engine = engineWith('mkv', dir);
  const out = resolveOutput(engine, { meta: { filename: 'video' } }, { strategy: 'mux' }, dir);
  assert.ok(out.endsWith('.mkv'), out);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('setting mp4 gera .mp4 para mux (sem regressao)', () => {
  const dir = tmpDir();
  const engine = engineWith('mp4', dir);
  const out = resolveOutput(engine, { meta: { filename: 'video' } }, { strategy: 'mux' }, dir);
  assert.ok(out.endsWith('.mp4'), out);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('job.meta.container tem prioridade sobre o setting', () => {
  const dir = tmpDir();
  const engine = engineWith('mp4', dir);
  const out = resolveOutput(engine, { meta: { filename: 'video', container: 'mkv' } }, { strategy: 'mux' }, dir);
  assert.ok(out.endsWith('.mkv'), out);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('container fica fixado no job apos a primeira resolucao', () => {
  const dir = tmpDir();
  const engine = engineWith('mp4', dir);
  const job = { meta: { filename: 'video' } };
  const first = resolveOutput(engine, job, { strategy: 'mux' }, dir);
  engine.settings.get = () => 'mkv'; // muda o setting depois
  const second = resolveOutput(engine, job, { strategy: 'mux' }, dir);
  assert.equal(path.extname(first), path.extname(second));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('URL direta com extensao nao vira mkv', () => {
  const dir = tmpDir();
  const engine = engineWith('mkv', dir);
  const out = resolveOutput(engine, { meta: { filename: 'video' } }, { downloadUrl: 'https://x/v.ts' }, dir);
  assert.ok(out.endsWith('.ts'), out);
  fs.rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/unit/output-container.test.js`
Expected: FAIL nos casos `mkv`.

- [ ] **Step 3: Implementar**

```js
import { normalizeContainer } from './container.js';

export function resolveOutput(engine, job, prepared, destination) {
  const dir = destination || engine.settings?.get?.('defaultDir') || getDefaultDownloadsDir();
  // Fixa o container no job: mudar o setting no meio nao renomeia o arquivo.
  if (!job.meta) job.meta = {};
  if (!job.meta.container) {
    job.meta.container = normalizeContainer(
      job.meta.containerOverride || engine.settings?.get?.('videoContainer'),
    );
  }
  const ext = extensionFor(prepared, job._sourceType || job.meta.sourceType, job.meta.container);
  // ... resto igual
}
```

> **Cuidado:** `job.meta.container` é persistido no histórico. Isso é desejado:
> registrar com qual container o arquivo foi criado.

- [ ] **Step 4: Rodar e ver passar + caracterização**

Run: `node --test tests/unit/output-container.test.js tests/unit/batch-names.test.js`
Expected: PASS, com `batch-names.test.js` sem edição.

```bash
git add src/core/engine/lifecycle/output.js tests/unit/output-container.test.js
git commit -m "feat(container): resolveOutput respeita setting e override"
```

---

### Task 5: Mux e turbo-mux sem `-movflags` em MKV

**Files:**
- Modify: `src/core/engine/runners/mux.js`
- Modify: `src/core/engine/executor/turbo.js`
- Modify: `src/ffmpeg/muxer.js` (`buildMuxArgs` + `MODES[2]`)
- Modify: `src/cli/download/mux-multi-args.js`
- Test: `tests/unit/mux-container.test.js`

**Interfaces:**
- Consumes: `normalizeContainer`, `containerOutputArgs` (Task 1).
- Produces: `buildMuxArgs({ videoInput, audioInput, output })` deriva o container
  de `path.extname(output)`; `buildMuxMultiArgs(...)` idem; `MODES[2]` deixa de
  ter `-movflags` fixo.

**São quatro emissores de `movflags` — todos precisam mudar** (levantamento no
código real):

| Arquivo | Linha | Contexto |
|---|---|---|
| `src/ffmpeg/muxer.js` | 85 | `buildMuxArgs` (mux vídeo+áudio) |
| `src/ffmpeg/muxer.js` | 23 | `MODES[2]` fallback `aac` (usado por `single-mode.js` em produção) |
| `src/core/engine/runners/mux.js` | 115 | `runMuxMultiDownload` inline |
| `src/cli/download/mux-multi-args.js` | 35 | `buildMuxMultiArgs` (CLI) |

- [ ] **Step 1: Escrever os testes**

```js
// tests/unit/mux-container.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMuxArgs } from '../../src/ffmpeg/muxer.js';
import { buildMuxMultiArgs } from '../../src/cli/download/mux-multi-args.js';

test('buildMuxArgs com .mp4 mantem -movflags +faststart', () => {
  const args = buildMuxArgs({ videoInput: 'v.mp4', audioInput: 'a.m4a', output: '/out/x.mp4' });
  assert.ok(args.includes('-movflags'));
  assert.equal(args[args.indexOf('-movflags') + 1], '+faststart');
});

test('buildMuxArgs com .mkv NAO emite -movflags', () => {
  const args = buildMuxArgs({ videoInput: 'v.mp4', audioInput: 'a.m4a', output: '/out/x.mkv' });
  assert.equal(args.includes('-movflags'), false, args.join(' '));
});

test('buildMuxArgs preserva -c copy nos dois', () => {
  for (const out of ['/out/x.mp4', '/out/x.mkv']) {
    const args = buildMuxArgs({ videoInput: 'v.mp4', audioInput: 'a.m4a', output: out });
    assert.equal(args[args.indexOf('-c:v') + 1], 'copy');
    assert.equal(args[args.indexOf('-c:a') + 1], 'copy');
  }
});

test('buildMuxMultiArgs com .mkv NAO emite -movflags', () => {
  const args = buildMuxMultiArgs({
    videoTmp: 'v.mp4', audioTmps: ['a0.m4a'], audioLanguages: ['pt'], output: '/out/x.mkv',
  });
  assert.equal(args.includes('-movflags'), false, args.join(' '));
});

test('buildMuxMultiArgs com .mp4 mantem -movflags', () => {
  const args = buildMuxMultiArgs({ videoTmp: 'v.mp4', audioTmps: ['a0.m4a'], output: '/out/x.mp4' });
  assert.ok(args.includes('-movflags'));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/unit/mux-container.test.js`
Expected: FAIL nos casos `.mkv`.

- [ ] **Step 3: Implementar `buildMuxArgs`**

Remover o par `-movflags +faststart` fixo e inserir
`...containerOutputArgs(normalizeContainer(path.extname(output).slice(1)))`
antes do `output`.

- [ ] **Step 4: Corrigir `MODES[2]`**

`MODES` é uma lista estática (sem `output`). O `-movflags` do modo `aac` deixa
de existir **na lista** e passa a ser acrescentado em `buildDownloadArgs`
quando o output for `.mp4`:

```js
// MODES[2]: { name: 'aac', args: ['-c:v', 'copy', '-c:a', 'aac'] }
// buildDownloadArgs:
const extContainer = normalizeContainer(path.extname(output).slice(1));
const args = [...mode.args, ...containerOutputArgs(extContainer), output];
```

> Isso mantém o fallback `aac` funcionando em MP4 **e** deixa de emitir
> `-movflags` em MKV, sem precisar duplicar `MODES` por container.

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test tests/unit/mux-container.test.js tests/unit/ffmpeg-muxer.test.js`
Expected: PASS. Se `ffmpeg-muxer.test.js` falhar por causa do `MODES[2]`, o teste
está verificando a lista estática — atualizar a asserção para refletir a ausência
de `-movflags` na lista (comportamento novo e intencional).

- [ ] **Step 6: Ajustar `runMuxMultiDownload` (mux.js:115)**

Trocar `ffmpegArgs.push('-movflags', '+faststart', output);` por:

```js
ffmpegArgs.push(...containerOutputArgs(normalizeContainer(path.extname(output).slice(1))));
ffmpegArgs.push(output);
```

- [ ] **Step 7: Ajustar `buildMuxMultiArgs` (CLI)**

Trocar `ffmpegArgs.push('-movflags', '+faststart', output);` pelo mesmo padrão.

- [ ] **Step 8: Rodar a suíte de mux e commitar**

Run: `node --test tests/unit/mux-container.test.js tests/unit/ffmpeg-muxer.test.js tests/integration/hls-dash-local.test.js`
Expected: PASS. (A falha pré-existente do DASH local é conhecida — se aparecer,
confirmar que é a mesma antes de seguir.)

```bash
git add src/ffmpeg/muxer.js src/core/engine/runners/mux.js src/cli/download/mux-multi-args.js tests/unit/mux-container.test.js
git commit -m "feat(container): mux respeita mp4/mkv nos args"
```

---

### Task 6: yt-dlp com `mergeOutputFormat` do contêiner

**Files:**
- Modify: `src/transports/ytdlp-runner.js`
- Test: `tests/unit/ytdlp-merge-container.test.js`

**Interfaces:**
- Consumes: `normalizeContainer` (Task 1).
- Produces: `runYtDlpDownload` deriva `mergeOutputFormat` de `path.extname(output)`.

- [ ] **Step 1: Escrever o teste**

```js
// tests/unit/ytdlp-merge-container.test.js
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Captura as opções passadas ao executor do yt-dlp.
let capturedOptions = null;
mock.module('../../src/core/binaries.js', {
  namedExports: {
    binName: (b) => b,
    packagedBinaryPath: () => '',
    getYtDlpExec: async () => {
      const exec = async (_url, options) => { capturedOptions = options; return {}; };
      return exec;
    },
    resetYtDlpCache: () => {},
  },
});

test('output .mkv usa mergeOutputFormat mkv', async () => {
  const { runYtDlpDownload } = await import('../../src/transports/ytdlp-runner.js');
  await runYtDlpDownload({ url: 'https://x/v', formatId: 'best', output: '/out/x.mkv' });
  assert.equal(capturedOptions.mergeOutputFormat, 'mkv');
});

test('output .mp4 mantem mergeOutputFormat mp4', async () => {
  const { runYtDlpDownload } = await import('../../src/transports/ytdlp-runner.js');
  await runYtDlpDownload({ url: 'https://x/v', formatId: 'best', output: '/out/x.mp4' });
  assert.equal(capturedOptions.mergeOutputFormat, 'mp4');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/unit/ytdlp-merge-container.test.js`
Expected: FAIL no `.mkv` (hoje fixo em `'mp4'`).

- [ ] **Step 3: Implementar**

```js
import path from 'node:path';
import { normalizeContainer } from '../core/engine/lifecycle/container.js';
// ...
const container = normalizeContainer(path.extname(output).slice(1));
const options = {
  format: formatId || 'best',
  output,
  mergeOutputFormat: container,
  // ...
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/unit/ytdlp-merge-container.test.js tests/unit/transports-ytdlp-runner.test.js`
Expected: PASS.

```bash
git add src/transports/ytdlp-runner.js tests/unit/ytdlp-merge-container.test.js
git commit -m "feat(container): yt-dlp junta no container do output"
```

---

### Task 7: `embedSubtitles` por contêiner (corrige a corrupção)

**Files:**
- Modify: `src/core/engine/runners/subtitles.js`
- Test: `tests/unit/subtitles-embed-container.test.js`

**Interfaces:**
- Consumes: `normalizeContainer`, `containerOutputArgs` (Task 1).
- Produces: `embedSubtitles` com soft subs em MKV e hardcode em MP4.

- [ ] **Step 1: Escrever os testes**

```js
// tests/unit/subtitles-embed-container.test.js
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Captura os args do FFmpeg sem executar nada.
const calls = [];
mock.module('../../src/ffmpeg/service.js', {
  namedExports: {
    ffmpegService: {
      run: ({ args }) => {
        calls.push(args);
        return { promise: Promise.resolve({ ok: true, code: 0 }) };
      },
    },
  },
});

// fetch fake para baixar a legenda.
const SRT = '1\n00:00:00,000 --> 00:00:01,000\nOla\n';
globalThis.fetch = async () => new Response(SRT, { status: 200 });

// fs fake mínimo para o fluxo de arquivos.
// (Preferir um diretório tmp real para videoPath e deixar o fs real agir.)

test('MKV usa soft subs (-c:v copy -c:s srt) e nunca .subbed.mp4', async () => {
  calls.length = 0;
  const { embedSubtitles } = await import('../../src/core/engine/runners/subtitles.js');
  // video .mkv real em tmp
  // ... criar arquivo vazio x.mkv
  // await embedSubtitles({ videoPath: '/tmp/x.mkv', subtitleTracks: [{ uri: 'http://127.0.0.1/l.srt', language: 'pt' }], selectedLanguages: ['pt'], embedSubs: true });
  // assert: args inclui '-c:v','copy'; inclui '-c:s','srt'; NAO inclui 'libx264';
  // assert: nenhum arg termina em '.subbed.mp4'
});

test('MP4 mantem hardcode com libx264 e movflags', async () => {
  // mesma preparacao, video .mp4
  // assert: args inclui 'libx264' e '-movflags'
});
```

> O teste real deve criar os arquivos com `fs.mkdtempSync` e servir o `.srt` por
> um servidor HTTP local (`tests/integration` já tem o padrão) **ou** injetar
> `fetchImpl` como dependência. Preferir `fetchImpl` injetável: menos flaky.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/unit/subtitles-embed-container.test.js`
Expected: FAIL (hoje sempre `libx264` + `.subbed.mp4`).

- [ ] **Step 3: Implementar**

Em `embedSubtitles`, ramo hardcode atual vira dois ramos:

```js
const container = normalizeContainer(path.extname(videoPath).slice(1));
const tmpOutput = `${videoPath}.subbed${path.extname(videoPath)}`;

if (container === 'mkv') {
  // Soft subs: legenda como faixa, sem re-encode.
  const args = ['-hide_banner', '-loglevel', 'error', '-nostats', '-y', '-i', videoPath];
  for (const sub of subFiles) args.push('-i', sub.file);
  args.push('-map', '0', '-c:v', 'copy', '-c:a', 'copy');
  for (let i = 0; i < subFiles.length; i++) {
    args.push(`-map`, `${i + 1}:0`, '-c:s', 'srt');
    args.push(`-metadata:s:s:${i}`, `language=${subFiles[i].language}`);
  }
  args.push('-progress', 'pipe:1', tmpOutput);
} else {
  // Hardcode (comportamento atual preservado).
  // ... inputs + -vf subtitles=... + libx264 + containerOutputArgs('mp4') + tmpOutput
}
```

O `rename(tmpOutput, videoPath)` final **mantém a extensão original** — o
`path.extname(videoPath)` garante que um `.mkv` nunca recebe conteúdo MP4.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/unit/subtitles-embed-container.test.js tests/unit/p12-subtitles.test.js`
Expected: PASS.

- [ ] **Step 5: Verificação manual ponta a ponta (o bug real)**

Criar um `.mkv` e rodar `embedSubtitles` com `embedSubs: true`. Depois:

```bash
ffprobe -v error -show_entries format=format_name -of csv=p=0 x.mkv
# Esperado: "matroska,webm"   (antes: "mov,mp4,m4a,3gp,3g2,mj2")
ffprobe -v error -show_entries stream=codec_type,codec_name -of csv x.mkv
# Esperado: h264 + aac + subrip
```

```bash
git add src/core/engine/runners/subtitles.js tests/unit/subtitles-embed-container.test.js
git commit -m "fix(container): embedSubtitles nao corrompe mkv"
```

---

### Task 8: UI — menu "Formato do vídeo" nas Configurações

**Files:**
- Modify: `electron/templates/settings.html`
- Test: `tests/unit/settings-template-container.test.js`

**Interfaces:**
- Consumes: o fluxo existente de `data-setting` + `settings:update`.
- Produces: `<select data-setting="videoContainer">` com `mp4` e `mkv`.

- [ ] **Step 1: Escrever o teste do template**

```js
// tests/unit/settings-template-container.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../electron/templates/settings.html', import.meta.url), 'utf8');

test('settings.html tem select de videoContainer com mp4 e mkv', () => {
  assert.match(html, /data-setting="videoContainer"/);
  assert.match(html, /<option value="mp4"/);
  assert.match(html, /<option value="mkv"/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/unit/settings-template-container.test.js`
Expected: FAIL.

- [ ] **Step 3: Adicionar o campo ao template**

Depois do `<label>` de "Qualidade padrão", antes de "Extrair áudio":

```html
<label class="prompt">
  <span class="prompt-title">Formato do vídeo:</span>
  <select data-setting="videoContainer">
    <option value="mp4">MP4 — compatível com qualquer player</option>
    <option value="mkv">MKV — permite legenda como faixa</option>
  </select>
  <span class="hint-line">MKV mantém a legenda selecionável no player, sem re-encodar o vídeo.</span>
</label>
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/unit/settings-template-container.test.js`
Expected: PASS.

> O `panel-settings.js` é genérico (`data-setting` + `input.value`) — `<select>`
> funciona como o `audioExtract` já funciona. Nenhuma mudança de JS.

```bash
git add electron/templates/settings.html tests/unit/settings-template-container.test.js
git commit -m "feat(ui): menu de formato do video nas configuracoes"
```

---

### Task 9: CLI `--container`

**Files:**
- Modify: `src/cli/commands/flags.js`
- Modify: `src/cli/commands/help.js`
- Modify: `src/cli-flow/parse-flags.js`
- Modify: `electron/ipc/queue/enqueue.js`
- Modify: `electron/security-payloads-queue/queue-enqueue.js`
- Test: `tests/unit/cli-container-flag.test.js`, `tests/unit/queue-enqueue-container.test.js`

**Interfaces:**
- Consumes: `normalizeContainer` (Task 1).
- Produces: `--container mp4|mkv` → `job.meta.container`; payload de
  `queue:enqueue` aceita `container`.

- [ ] **Step 1: Escrever os testes**

```js
// tests/unit/cli-container-flag.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDownloadFlags } from '../../src/cli/commands/flags.js';

test('--container mkv e lido', () => {
  assert.equal(parseDownloadFlags(['--container', 'mkv']).container, 'mkv');
});
test('--container invalido cai em vazio (usa setting)', () => {
  assert.equal(parseDownloadFlags(['--container', 'avi']).container, '');
});
test('sem --container, container e vazio', () => {
  assert.equal(parseDownloadFlags([]).container, '');
});
```

```js
// tests/unit/queue-enqueue-container.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateQueueEnqueuePayload } from '../../electron/security-payloads-queue/queue-enqueue.js';

test('container mkv passa e e normalizado', () => {
  const p = validateQueueEnqueuePayload({ url: 'https://x/v', container: 'MKV' });
  assert.equal(p.container, 'mkv');
});
test('container invalido vira vazio', () => {
  const p = validateQueueEnqueuePayload({ url: 'https://x/v', container: 'avi' });
  assert.equal(p.container, '');
});
test('sem container vira vazio', () => {
  assert.equal(validateQueueEnqueuePayload({ url: 'https://x/v' }).container, '');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/unit/cli-container-flag.test.js tests/unit/queue-enqueue-container.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar nas flags**

`parseDownloadFlags`: `container: ''` no objeto inicial e
`else if (arg === '--container') flags.container = ['mp4','mkv'].includes((rest[++i]||'').toLowerCase()) ? rest[i].toLowerCase() : '';`

`help.js`: documentar `--container <mp4|mkv>`.

`parse-flags.js`: ler `--container` e devolver no objeto.

- [ ] **Step 4: Implementar no IPC**

`queue-enqueue.js`: aceitar `container` normalizado (allowlist, vazio se inválido).
`enqueue.js`: repassar para `meta.container` como `containerOverride`
(a Task 4 lê `job.meta.containerOverride`), **não** em `meta.container`, para
não conflitar com o container fixado na resolução.

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test tests/unit/cli-container-flag.test.js tests/unit/queue-enqueue-container.test.js`
Expected: PASS.

```bash
git add src/cli/commands/flags.js src/cli/commands/help.js src/cli-flow/parse-flags.js electron/ipc/queue/enqueue.js electron/security-payloads-queue/queue-enqueue.js tests/unit/cli-container-flag.test.js tests/unit/queue-enqueue-container.test.js
git commit -m "feat(cli): flag --container mp4/mkv e propagacao no ipc"
```

---

### Task 10: Documentação e verificação final

**Files:**
- Modify: `README.md`
- Modify: `docs/specs/11-formato-container.md` (Status → Implementado)
- Modify: `package.json` (keywords `mkv`, `container`)

- [ ] **Step 1: Documentar no README**

Seção curta: setting "Formato do vídeo" (MP4/MKV), o que muda (soft subs em MKV,
`mvk` sem re-encode), flag `--container`, e a nota de que transcrição e extração
de áudio funcionam com os dois.

- [ ] **Step 2: Rodar a suíte completa e o lint**

Run: `npm run test:unit`
Expected: todos PASS (os 1023 atuais + os novos).

Run: `npm run lint`
Expected: 0 erros; baseline de avisos não aumenta.

- [ ] **Step 3: Rodar o verificador de tamanho**

Run: `npm run analisar:linhas`
Expected: nenhum arquivo novo acima de ~150 linhas.

- [ ] **Step 4: Verificação manual ponta a ponta**

1. Configurações → Formato do vídeo → **MKV** → Salvar.
2. Baixar um HLS → confirmar `.mkv` e `ffprobe` → `matroska,webm`.
3. Transcrever o `.mkv` → confirmar `.transcription.srt` gerado.
4. Voltar para **MP4** → baixar outro HLS → confirmar `.mp4` (sem regressão).

- [ ] **Step 5: Commit**

```bash
git add README.md package.json docs/specs/11-formato-container.md
git commit -m "docs(container): documentar formato mp4/mkv"
```

---

## Verificação manual (fora do TDD)

Depois da Task 10:

1. Baixar 3 HLS com MKV selecionado → todos `.mkv`, todos abrem em VLC/MPV.
2. Transcrever um `.mkv` → `.srt` gerado e sincronizado.
3. `streamgrab download <url> --container mkv` → `.mkv` mesmo com setting `mp4`.
4. `streamgrab download <url> --container mp4` → `.mp4`.
5. Baixar com `--subs pt --embed-subs` e MKV → `ffprobe` mostra faixa `subrip`;
   arquivo continua `matroska`.
6. Baixar com `--subs pt --embed-subs` e MP4 → legenda queimada (sem faixa).