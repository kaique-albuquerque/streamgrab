# Plano de Implementação — Converter Vídeo Local para MKV

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

> **Origem:** SPEC-12 — `docs/specs/12-converter-mkv.md`
> **Prioridade:** Baixa | **Esforço:** Baixo | **Riscos:** Baixo

**Goal:** Converter um vídeo local (MP4/MKV/WebM/MOV) para MKV pelo Electron ou
CLI, via remux (`-c copy`), sem re-encode e sem tocar no original.

**Architecture:** Módulo puro `src/convert/` (args + orquestração) sobre o
`ffmpegService` existente. IPC `convert:*` com job próprio (singleton, sem fila
persistida — conversão é rápida). Card na aba Transcrever, reusando
`app:pick-media-file`.

**Tech Stack:** Node 20 ESM, `node:test` + `node:assert/strict`, Electron 37,
FFmpeg (vendor/extraResources).

**Spec:** `docs/specs/12-converter-mkv.md`

## Global Constraints

- Remux sempre (`-c copy`); nunca re-encode.
- O arquivo de entrada **nunca** é modificado ou removido.
- Destino nunca sobrescreve: usa `nextAvailableName`.
- Entrada já `.mkv` → não faz nada, `alreadyMkv: true`.
- Nenhum arquivo acima de ~150 linhas.
- `npm run lint` com 0 erros; não aumentar o baseline de avisos.
- Testes em `node:test` + `node:assert/strict`.

## Review Focus

1. **Entrada já `.mkv`:** não pode chamar o FFmpeg (seria `ffmpeg -i x.mkv -c copy x.mkv`, que falha ou corrompe). Esperado: `alreadyMkv: true` e retorno imediato.
2. **Destino existente:** `video.mkv` já existe → `video (1).mkv`, nunca sobrescrever.
3. **Cancelamento no meio:** processo morto e **nenhum** `.mkv` parcial no disco.
4. **Codec incompatível com MKV** (ex.: áudio AC-3 em MP4): `-c copy` falha. Esperado: erro claro sugerindo re-encode manual, não um `.mkv` vazio.
5. **Extensão não-vídeo** (`.txt`, `.pdf`): recusado antes de chamar o FFmpeg.
6. **Caminho com espaços/acentos:** argv em array (sem shell) preserva; aspas não são necessárias.

---

### Task 1: Args do remux (puro)

**Files:**
- Create: `src/convert/args.js`
- Test: `tests/unit/convert-args.test.js`

**Interfaces:**
- Produces: `buildRemuxArgs({ input, output })` → `string[]`.

- [ ] **Step 1: Escrever os testes**

```js
// tests/unit/convert-args.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRemuxArgs } from '../../src/convert/args.js';

test('usa -c copy (remux, sem re-encode)', () => {
  const args = buildRemuxArgs({ input: 'a.mp4', output: 'a.mkv' });
  assert.equal(args[args.indexOf('-c') + 1], 'copy');
  assert.equal(args.includes('libx264'), false);
});

test('mantem todas as faixas com -map 0', () => {
  const args = buildRemuxArgs({ input: 'a.mp4', output: 'a.mkv' });
  assert.equal(args[args.indexOf('-map') + 1], '0');
});

test('entrada e saida estao no lugar certo', () => {
  const args = buildRemuxArgs({ input: 'a.mp4', output: 'a.mkv' });
  assert.equal(args[args.indexOf('-i') + 1], 'a.mp4');
  assert.equal(args[args.length - 1], 'a.mkv');
});

test('nao usa shell (argv em array)', () => {
  const args = buildRemuxArgs({ input: 'a b.mp4', output: 'a b.mkv' });
  assert.ok(args.includes('a b.mp4'));
});
```

- [ ] **Step 2: Rodar e ver falhar** — `Cannot find module .../args.js`
- [ ] **Step 3: Implementar** — `-hide_banner -loglevel error -nostats -y -i <in> -map 0 -c copy -progress pipe:1 <out>`
- [ ] **Step 4: Rodar e ver passar** — 4 PASS
- [ ] **Step 5: Commit** — `feat(convert): args do remux para mkv`

---

### Task 2: Orquestração e API pública

**Files:**
- Create: `src/convert/index.js`
- Create: `src/convert/errors.js`
- Test: `tests/unit/convert-api.test.js`

**Interfaces:**
- Consumes: `buildRemuxArgs` (Task 1), `ffmpegService`.
- Produces: `convertToMkv(options)` → `ConvertResult`; `ConvertError`.

- [ ] **Step 1: Escrever os testes** (com `deps.run` injetável)

```js
test('entrada .mkv: alreadyMkv true e nao chama ffmpeg', async () => {
  let called = false;
  const r = await convertToMkv({ inputPath: '/tmp/a.mkv', deps: { run: () => { called = true; } } });
  assert.equal(r.alreadyMkv, true);
  assert.equal(called, false);
});

test('entrada .mp4: gera .mkv ao lado', async () => {
  // usa deps.run fake que grava o output
});

test('destino existente: gera (1).mkv', async () => {});

test('arquivo inexistente: ConvertError com code', async () => {
  await assert.rejects(convertToMkv({ inputPath: '/nao/existe.mp4' }), /nao encontrado/i);
});

test('extensao nao-video: ConvertError', async () => {
  await assert.rejects(convertToMkv({ inputPath: '/tmp/a.txt' }), /video/i);
});

test('cancelamento: sem arquivo parcial', async () => {});
```

- [ ] **Step 2: Rodar e ver falhar**
- [ ] **Step 3: Implementar** — valida entrada, resolve saída, roda, confere tamanho > 0, devolve resultado. `finally` limpa parcial em erro/cancel.
- [ ] **Step 4: Rodar e ver passar**
- [ ] **Step 5: Commit** — `feat(convert): api convertToMkv`

---

### Task 3: IPC e validação de payload

**Files:**
- Create: `electron/security-payloads-convert.js`
- Create: `electron/ipc/convert-handlers.js`
- Modify: `electron/security-payloads.js`, `electron/security.js`, `electron/main/ipc-registry.js`, `electron/preload.cjs`
- Test: `tests/unit/convert-security-payloads.test.js`, `tests/unit/convert-ipc.test.js`

- [ ] **Step 1: Testes de validação** — rejeita `.txt`, inexistente, relativo; aceita `.mp4` absoluto.
- [ ] **Step 2: Ver falhar**
- [ ] **Step 3: Implementar** — `validateConvertPayload` espelhando `security-payloads-transcribe.js`.
- [ ] **Step 4: Handlers** — `convert:start` (singleton, progresso, cancel), `convert:cancel`.
- [ ] **Step 5: Preload** — `convertStart`, `convertCancel`, `onConvertProgress/Done/Error`.
- [ ] **Step 6: Commit** — `feat(convert): canais ipc e validacao`

---

### Task 4: UI — card na aba Transcrever

**Files:**
- Modify: `electron/templates/transcribe.html`
- Create: `electron/renderer/panel-convert.js`
- Modify: `electron/renderer/panel-transcribe/controller.js`, `electron/renderer/bootstrap/transcribe-events.js`
- Test: `tests/unit/convert-panel-events.test.js`

- [ ] **Step 1: Teste de rótulos/eventos**
- [ ] **Step 2: Ver falhar**
- [ ] **Step 3: Card no template** — botão `convertStartBtn`, barra, hint.
- [ ] **Step 4: Painel** — chama `pickMediaFile`, `convertStart`, reflete progresso.
- [ ] **Step 5: Commit** — `feat(ui): card de conversao para mkv`

---

### Task 5: CLI `streamgrab convert`

**Files:**
- Create: `src/cli/commands/convert.js`
- Modify: `src/cli/commands/parse-command.js`, `help.js`, `src/cli/commands.js`, `src/index.js`
- Test: `tests/unit/convert-command.test.js`

- [ ] **Step 1: Teste de parse** — `convert` reconhecido, `--output` lido.
- [ ] **Step 3: Implementar** — `runConvertCommand` imprime progresso e caminho.
- [ ] **Step 4: Commit** — `feat(cli): subcomando convert`

---

### Task 6: Documentação e verificação final

**Files:**
- Modify: `README.md`, `docs/specs/12-converter-mkv.md` (Status → Implementado), `package.json` (keyword `convert`)

- [ ] **Step 1: README** — seção curta.
- [ ] **Step 2: `npm test` + `npm run lint`** — 0 erros.
- [ ] **Step 3: `npm run analisar:linhas`** — 0 acima de 150.
- [ ] **Step 4: Commit** — `docs(convert): documentar conversao para mkv`

---

## Verificação manual

1. `streamgrab convert video.mp4` → `video.mkv` ao lado, `ffprobe` = `matroska,webm`.
2. Converter de novo → `video (1).mkv` (não sobrescreve).
3. Cancelar no meio → sem `.mkv` parcial.
4. Card no Electron → seleciona `.mp4` → progresso → "Abrir pasta".