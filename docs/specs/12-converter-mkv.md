# Spec: Converter Vídeo Local para MKV

> **ID:** SPEC-12
> **Status:** Implementado
> **Prioridade:** Baixa
> **Impacto:** 🔥
> **Esforço:** Baixo

---

## 1. Objetivo

Permitir que o usuário pegue um vídeo que **já tem em disco** (MP4, MKV, WebM,
MOV…) e o converta para **MKV** pelo Electron, sem precisar de terminal.

**Caso de uso:** o usuário baixa um vídeo em MP4 (o formato padrão do app), quer
legenda como faixa selecionável e precisa de MKV. Hoje ele teria que abrir o
terminal e rodar `ffmpeg -i input.mp4 -c copy output.mkv`.

**Não-objetivo:** converter para MP4, WebM, MOV ou outros; re-encodar (mudar
codec); editar/trimar; converter áudio (isso já existe em P13).

---

## 2. Comportamento Atual

- O app **não tem** nenhuma funcionalidade de conversão de vídeo. Não há canal
  IPC, botão ou menu.
- O FFmpeg já está disponível em `vendor/ffmpeg` (dev) e
  `extraResources/bin` (instalador), resolvido por `getFfmpegCommand()`.
- `ffmpegService.run({ args, onProgress, signal })` já oferece execução com
  progresso e cancelamento.
- O padrão de IPC de arquivo (`app:pick-media-file`, `app:open-file`,
  `app:show-in-folder`) já existe e valida caminhos.
- A conversão MP4→MKV é **remux** (`-c copy`): h264+aac são compatíveis com
  Matroska, então não há re-encode — leva 1-2 s por hora de vídeo e não perde
  qualidade.

---

## 3. Comportamento Desejado

### 3.1. UI

Na aba **Fila** (ou um card novo em "Transcrever"), um card:

```
┌────────────────────────────────────────────────────┐
│ Converter vídeo para MKV                           │
│ Pega um vídeo do seu computador e gera um .mkv     │
│                                                    │
│ [ 📁 Selecionar vídeo e converter ]                │
└────────────────────────────────────────────────────┘
```

- Botão abre seletor de arquivo (`.mp4`, `.mkv`, `.webm`, `.mov`, `.m4v`, `.ts`).
- Ao escolher, o app:
  1. Valida que o arquivo existe e tem extensão de vídeo.
  2. Se já for `.mkv`, avisa "já é MKV" e não faz nada.
  3. Converte para `<base>.mkv` no mesmo diretório.
  4. Mostra progresso (barra) e, ao final, "Abrir pasta".
- Se o `.mkv` de destino já existir, gera `<base> (1).mkv` (não sobrescreve).

### 3.2. CLI

```bash
streamgrab convert <arquivo.mp4>
streamgrab convert <arquivo.mp4> --output <dir>
```

### 3.3. Arquivo gerado

- Entrada `video.mp4` → saída `video.mkv` no mesmo diretório.
- O arquivo de entrada **nunca** é modificado nem removido.
- Se o destino existir, usa `nextAvailableName` (`video (1).mkv`).

---

## 4. Contrato das interfaces

### 4.1. API pública (`src/convert/index.js`)

```js
export function convertToMkv(options) → Promise<ConvertResult>

// options: {
//   inputPath: string,          // arquivo de vídeo de entrada
//   outputPath?: string,        // default: <base>.mkv ao lado
//   signal?: AbortSignal,
//   onProgress?: ({ percent, outMs, totalMs }) => void,
//   onLog?: (line: string) => void,
//   deps?: { run? }             // injeção para testes
// }

// ConvertResult: {
//   outputPath: string,
//   size: number,
//   durationMs: number,
//   alreadyMkv: boolean,        // true quando a entrada já era .mkv
// }
```

### 4.2. Módulos internos

| Módulo | Responsabilidade |
|---|---|
| `src/convert/args.js` | `buildRemuxArgs({ input, output })` — args puros do FFmpeg |
| `src/convert/index.js` | Orquestra: valida, roda, confere saída |
| `src/convert/errors.js` | `ConvertError` com `code` amigável |

### 4.3. Canais IPC

| Canal | Sentido | Payload |
|---|---|---|
| `convert:start` | renderer → main | `{ inputPath }` |
| `convert:cancel` | renderer → main | `{ jobId }` |
| `convert:progress` | main → renderer | `{ jobId, percent, outMs, totalMs }` |
| `convert:done` | main → renderer | `{ jobId, outputPath, size }` |
| `convert:error` | main → renderer | `{ jobId, error, cancelled }` |

Validação em `electron/security-payloads-convert.js` (caminho absoluto
existente, extensão de vídeo, `.mkv` permitido).

### 4.4. Seletor de arquivo

Reusa `app:pick-media-file` (já aceita mp4/mkv/webm/mov/m4v/ts) — nenhum canal
novo.

---

## 5. Segurança

- Caminho de entrada validado: absoluto, sem `..`, arquivo regular, extensão de
  vídeo.
- Saída sempre derivada do nome de entrada + `.mkv` (nunca do valor do IPC).
- `nextAvailableName` evita sobrescrever arquivo existente.
- Sem shell: `ffmpegService.run` usa argv em array.
- Cancelamento propaga `AbortSignal` e mata o processo.

---

## 6. Testes exigidos

| Teste | O que prova |
|-------|-------------|
| `buildRemuxArgs` usa `-c copy` e não re-encoda | Remux, sem perda |
| `buildRemuxArgs` inclui `-map 0` (mantém todas as faixas) | Legendas/áudio preservados |
| Entrada já `.mkv` → `alreadyMkv: true`, não chama FFmpeg | Não faz trabalho inútil |
| Destino existente → gera ` (1).mkv` | Não sobrescreve |
| Arquivo inexistente → erro claro | Validação |
| Extensão não-vídeo → erro claro | Validação |
| Cancelamento → processo morto, sem arquivo parcial | Abort |
| Payload IPC rejeita caminho inválido | Segurança |
| Progresso emite percentual monotônico | UI |

---

## 7. Critérios de conclusão

- [ ] `streamgrab convert <arquivo.mp4>` gera `.mkv` ao lado
- [ ] Card "Converter vídeo para MKV" no Electron
- [ ] Progresso e cancelamento funcionam
- [ ] Arquivo de entrada intacto
- [ ] `npm test` e `npm run lint` passam
- [ ] Nenhum arquivo acima de ~150 linhas