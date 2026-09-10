# Spec: Exportar Lista de Downloads (Histórico)

> **ID:** SPEC-08  
> **Status:** Rascunho  
> **Prioridade:** Baixa  
> **Impacto:** 🔥🔥  
> **Esforço:** Baixo

---

## 1. Objetivo

Permitir que o usuário exporte o histórico de downloads em formatos abertos (CSV, JSON) para compartilhar, fazer backup, migrar de máquina, ou importar em outras ferramentas (planilhas, gerenciadores de mídia).

---

## 2. Comportamento Atual

- O histórico é armazenado localmente em `history.json` dentro do diretório `userData`.
- Não há interface para exportação — o usuário precisaria navegar manualmente até o arquivo no sistema de arquivos.

---

## 3. Comportamento Desejado

### 3.1. Botão "Exportar" na Aba de Histórico

Um novo botão **"📤 Exportar"** ao lado de "Limpar histórico" e "Atualizar":

```
[📤 Exportar CSV] [📤 Exportar JSON] [🗑️ Limpar histórico] [🔄 Atualizar]
```

### 3.2. Formatos Suportados

#### JSON (Completo)

Exporta todo o histórico como array JSON. Inclui todos os campos.

```json
[
  {
    "id": "hist-42",
    "title": "Curso JavaScript - Aula 10",
    "url": "https://example.com/video.m3u8",
    "provider": "hls",
    "format": "mp4",
    "destination": "/Downloads/curso-js-aula10.mp4",
    "status": "completed",
    "size": 524288000,
    "durationMs": 3600000,
    "date": "2026-09-10T14:30:00.000Z"
  }
]
```

#### CSV (Planilha)

Exporta como CSV with BOM (UTF-8) para compatibilidade com Excel/Google Sheets.

```csv
id,title,url,provider,format,destination,status,size,durationMs,date
hist-42,"Curso JavaScript - Aula 10",https://...,hls,mp4,/Downloads/...,completed,524288000,3600000,2026-09-10T14:30:00.000Z
```

### 3.3. Filtro por Seleção

O usuário pode optar por exportar:

| Opção | Descrição |
|-------|-----------|
| Histórico completo | Todos os registros |
| Apenas selecionados | Se houver checkboxes marcados |
| Do período visível | Apenas o que está filtrado na tela (se filtros ativos) |

### 3.4. Diálogo "Salvar como"

Ao clicar em exportar, o Electron abre um diálogo nativo `dialog.showSaveDialog()`:

```js
const result = await dialog.showSaveDialog({
  title: 'Exportar histórico',
  defaultPath: `streamgrab-historico-${new Date().toISOString().slice(0, 10)}`,
  filters: [
    { name: 'CSV (Planilha)', extensions: ['csv'] },
    { name: 'JSON', extensions: ['json'] },
  ],
});
```

### 3.5. Opção "Exportar automaticamente ao concluir"

Nas Configurações, toggle:

```
[✓] Exportar histórico automaticamente ao concluir cada download
     Pasta: [~/Downloads/streamgrab-logs/] [Escolher]
     Formato: [CSV ▼] [JSON ▼] [Ambos ▼]
```

---

## 4. APIs e Módulos

### IPC (Novos Canais)

| Canal | Payload | Retorno |
|-------|---------|---------|
| `history:export` | `{ format: 'csv' \| 'json', entries?, filePath }` | `{ ok, filePath, size }` |

### Core

- Nova função em `src/core/history-export.js` (sem dependência de Electron).

```js
export function exportHistoryAsJson(entries) {
  return JSON.stringify(entries, null, 2);
}

export function exportHistoryAsCsv(entries) {
  const headers = ['id', 'title', 'url', 'provider', 'format', 'destination', 'status', 'size', 'durationMs', 'date'];
  const bom = '\uFEFF';
  const rows = entries.map(e =>
    headers.map(h => {
      const val = String(e[h] ?? '');
      return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
    }).join(',')
  );
  return bom + headers.join(',') + '\n' + rows.join('\n');
}

export function exportHistoryToFile({ entries, format, filePath }) {
  const content = format === 'csv'
    ? exportHistoryAsCsv(entries)
    : exportHistoryAsJson(entries);
  fs.writeFileSync(filePath, content, 'utf-8');
  return { ok: true, filePath, size: Buffer.byteLength(content, 'utf-8') };
}
```

### Renderer

- Botão na aba de histórico chama `window.api.exportHistory({ format })`.
- O main.js gerencia o `dialog.showSaveDialog()` e depois escreve o arquivo.

---

## 5. Arquivos Modificados / Criados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `src/core/history-export.js` | Novo | Funções de exportação (JSON, CSV) |
| `electron/main.js` | Modificar | IPC handler `history:export` |
| `electron/preload.cjs` | Modificar | Expor `exportHistory` no `api` |
| `electron/renderer/panels.js` | Modificar | Adicionar botão e handler de export |
| `electron/styles.css` | Modificar | Estilo do botão |
| `electron/index.html` | Modificar | Adicionar botões no cabeçalho do histórico |

---

## 6. Fluxo Técnico

```
Usuário clica "Exportar CSV"
       │
       ▼
renderer → api.exportHistory({ format: 'csv' })
       │
       ▼
main.js → dialog.showSaveDialog()  ← escolhe pasta/nome
       │
       ▼
main.js → history.entries (getAll)
       │
       ▼
main.js → exportHistoryToFile({ entries, format, filePath })
       │
       ▼
main.js → retorna { ok, filePath, size }
       │
       ▼
renderer → Notification "Exportado com sucesso: 15 registros (2.4 KB)"
```

---

## 7. Segurança

- O diálogo `showSaveDialog` respeita as pastas permitidas (segurança seção 24).
- O arquivo é escrito apenas no caminho escolhido pelo usuário no diálogo nativo.
- URLs exportadas podem conter tokens temporários — o usuário é avisado antes de compartilhar:

> ⚠️ Atenção: as URLs exportadas podem conter tokens de acesso temporários.
> Recomendamos remover informações sensíveis antes de compartilhar o arquivo.

---

## 8. Testes

- Exportar CSV → arquivo gerado com BOM, cabeçalhos e dados corretos.
- Exportar JSON → arquivo gerado com array JSON válido.
- Abrir CSV no Excel → caracteres especiais (acentos) aparecem corretamente.
- Histórico vazio → exporta apenas cabeçalhos (CSV) ou array vazio (JSON).
- Cancelar diálogo → nenhum arquivo é criado.