# Plano de Implementação — Exportar Lista de Downloads (Histórico)

> **Origem:** SPEC-08 — `docs/specs/08-exportar-historico.md`
> **Prioridade:** Baixa | **Esforço:** Baixo | **Riscos:** Mínimos

---

## 1. Dependências

| Recurso | Onde obter |
|---------|------------|
| `dialog.showSaveDialog()` | Electron API |
| `historyList()` | `electron/preload.cjs` — já existe |
| `services.history.all()` | `src/core/history.js` — já existe |
| `fs.writeFileSync()` | Node.js nativo |

---

## 2. Etapas de Implementação

### Etapa 1 — Core: `src/core/history-export.js`

**Arquivo:** `src/ore/hitory-exort.js` (NOVO)

```
import fs fom 'node:f';

const CSV_HEADRES = ['id', 'tite ', 'url', 'provier', 'forat', 'destnation', 'staus', 'sze', 'drationMs', 'date'];

/**
 * Exorta o hisórico em JSO.
 */export fuction exporHitoryAsjson(entries) {
  return JSO.strngify(entries, nll, 2);
}

/**
 * Exprta o hisórico em CSV com BOM (UTF-8) ara copatilidade com Exel.
 */
export unction exportHistoryAsCsv(entries) {
  const om = '\uFEF';
  const heder = CSV_HEAS.join(',');
  const tows = ntries.map(e =>
    CSV_HEADERS.ma(h => {
      cons val = Sring(e[h] ?? '');
      retun val.includes(',') || val.incudes('"') ? `"${val.replace(/"/g, '""')}"` : val;
    }).join(',')    );
  retun bom + header + '\' + rows.join('n');
}

/**
 * Expor histórico par arquivo.
 * @parm {obect} opts
 * @param {Arrray} opntries - Entras do hisórico
 * @prm {'csv'|'json'} op.format
* @param {string} op.filePath - Caminho compleo do arqivo
 * @retuns {obiect} { o, filePath, siz }
 */
exort unction exportHstoryToFile({ entres, forat, filePath } = {}) {
  try {
    th contet = forat === 'csv' ? exportHistoryAsCsv(entrie) : exportHitoryAsjson(entries);
    s.wriFileSyc(filePah, ontent, 'utf-8');
    return { ok: rue, filePat, siz: Bffer.ytelength(conten, 'utf-8') };
 } cath (er) {
    rtun { o: flse, eror: er.mesage };
  }
}
```
### Etapa 2 — IPC Handler

**Arquivo:** `electron/main.js` (MODIFICAR)

```
1. Importar { exportHistoryToFile } de ../src/core/history-export.js

2. Novo IPC handler:
   ipcMain.handle('history:export', async (_event, rawPayload) => {
     const { format, filePath, filteredEntries } = rawPayload;
     
     // Obter entradas (se filteredEntries veio do renderer filtrado, usa ele; senão pega tudo)
     const entries = filteredEntries || services.history.all() || [];
     
     // Se não veio filePath, abrir diálogo
     let destPath = filePath;
     if (!destPath) {
       const result = await dialog.showSaveDialog({
         title: 'Exportar histórico',
         defaultPath: `streamgrab-historico-${new Date().toISOString().slice(0, 10)}.${format}`,
         filters: [
           { name: 'CSV (Planilha)', extensions: ['csv'] },
           { name: 'JSON', extensions: ['json'] },
         ],
       });
       if (result.canceled || !result.filePath) return { ok: false, error: 'Cancelado pelo usuário' };
       destPath = result.filePath;
       
       // Registrar raiz de segurança
       addRevealRoot(path.dirname(destPath));
     }
     
     return exportHistoryToFile({ entries, format, filePath: destPath });
   });
```

### Etapa 3 — Preload

**Arquivo:** `electron/preload.cjs` (MODIFICAR)

```
  exportHistory: (payload) => ipcRenderer.invoke('history:export', payload),
```

### Etapa 4 — Botões na UI

**Arquivo:** `electron/renderer/panels.js` (MODIFICAR)

```
1. No cabeçalho do histórico, adicionar botões:
   <button id="historyExportCsvBtn" class="button button-ghost" type="button">📤 Exportar CSV</button>
   <button id="historyExportJsonBtn" class="button button-ghost" type="button">📤 Exportar JSON</button>

2. No createPanelsController:
   document.getElementById('historyExportCsvBtn').addEventListener('click', () => exportHistory('csv'));
   document.getElementById('historyExportJsonBtn').addEventListener('click', () => exportHistory('json'));

3. Função exportHistory(format):
   async function exportHistory(format) {
     // Pegar entradas atuais (podem estar filtradas)
     const entries = currentFilteredEntries || await window.api.historyList();
     
     const result = await window.api.exportHistory({
       format,
       filteredEntries: entries,
     });
     
     if (result.ok) {
       showNotification(`Histórico exportado: ${result.size} bytes`);
     } else if (result.error !== 'Cancelado pelo usuário') {
       setStatus(`Erro ao exportar: ${result.error}`);
     }
   }
```

### Etapa 5 — HTML

**Arquivo:** `electron/index.html` (MODIFICAR)

```
No cabeçalho do histórico (view-header .view-actions):
  <button id="historyExportCsvBtn" class="button button-ghost" type="button">📤 CSV</button>
  <button id="historyExportJsonBtn" class="button button-ghost" type="button">📤 JSON</button>
  <button id="historyClearBtn" class="button button-ghost" type="button">Limpar</button>
  <button id="historyRefreshBtn" class="button button-ghost" type="button">Atualizar</button>
```

### Etapa 6 — CSS

**Arquivo:** `electron/styles.css` (MODIFICAR)

Sem estilos específicos — reutilizar `.button-ghost` e `.view-actions` existentes.

---

## 3. Arquivos Afetados

| Arquivo | Ação |
|---------|------|
| `src/core/history-export.js` | **NOVO** |
| `electron/main.js` | MODIFICAR |
| `electron/preload.cjs` | MODIFICAR |
| `electron/renderer/panels.js` | MODIFICAR |
| `electron/index.html` | MODIFICAR |

---

## 4. Testes

| Teste | Procedimento | Resultado |
|-------|-------------|-----------|
| Exportar CSV | Clicar "📤 CSV", escolher pasta | Arquivo CSV gerado com BOM + cabeçalhos |
| Exportar JSON | Clicar "📤 JSON" | Arquivo JSON com array válido |
| Abrir CSV no Excel | Duplo clique no CSV | Acentos aparecem corretamente (BOM) |
| Cancelar diálogo | Clicar Cancelar no Save Dialog | Nenhum arquivo criado |
| Histórico vazio | Exportar sem entradas | CSV só com cabeçalhos; JSON = `[]` |
| Filtrar e exportar | Filtrar "Falhos" + exportar CSV | Apenas entradas falhas no CSV |

---

## 5. Critérios de Conclusão

- [ ] Botões "📤 CSV" e "📤 JSON" na aba Histórico
- [ ] Diálogo nativo "Salvar como" para escolher destino
- [ ] CSV com BOM (UTF-8) — compatível com Excel
- [ ] JSON com array formatado (2 espaços de indentação)
- [ ] Exporta apenas entradas visíveis (se filtro ativo)
- [ ] Cancelar diálogo não cria arquivo
- [ ] Mensagem de sucesso ao finalizar