# Plano de Implementação — Tutorial Interativo

> **Origem:** SPEC-02 — `docs/specs/02-tutorial-interativo.md`
> **Prioridade:** Alta | **Esforço:** Baixo | **Riscos:** Baixos

---

## 1. Dependências

| Recurso | Onde obter |
|---------|------------|
| `settings.get('tutorialCompleted')` | `src/core/settings.js` — já existe |
| Elementos alvo do tour | `#view-videos`, `[data-field="url"]`, `[data-action="analyze"]`, `[data-action="download"]` |
| Template system | `electron/index.html` — já usa templates |

---

## 2. Etapas de Implementação

### Etapa 1 — Controller do Tutorial

**Arquivo:** `electron/renderer/tutorial.js` (NOVO)

```
export function createTutorial({ dom, settings, onFinish, onSkip }):

  Passos do tour (4 passos):
    1. { target: '[data-field="url"]', position: 'bottom',
         title: 'Cole a URL do vídeo',
         text: 'Abra o vídeo no navegador, aperte F12 → Network, filtre por "m3u8", copie a URL e cole aqui.' }
    2. { target: '[data-action="analyze"]', position: 'top',
         title: 'Analise o conteúdo',
         text: 'Clique em "Analisar playlist" para descobrir as qualidades disponíveis.' }
    3. { target: '[data-field="qualities"]', position: 'top',
         title: 'Escolha a qualidade',
         text: 'Selecione a qualidade desejada. A melhor disponível é usada automaticamente.' }
    4. { target: '[data-action="download"]', position: 'top',
         title: 'Baixe o vídeo',
         text: 'Clique em "Baixar agora" e aguarde. O arquivo será salvo na pasta Downloads.' }

  Métodos:
    - start(): inicializa o tour (chamado na primeira execução)
    - runFullTour(): reabre o tour completo
    - showUrlHelp(): modal "Como obter a URL do vídeo"
    - showQuickTips(): mini modal de dicas rápidas
    - stop(): finaliza e limpa

  Mecanismo:
    1. Criar overlay <div class="tour-overlay"> (semi-transparente, z-index 999)
    2. Para cada passo:
       a. Calcular posição do elemento alvo via getBoundingClientRect()
       b. Posicionar tooltip com seta apontando para o alvo
       c. Highlight: aplicar outline/border glow no elemento alvo
       d. Renderizar navegação: [Anterior] [Próximo/Concluir] [Pular]
    3. Ao último passo, marcar settings.tutorialCompleted = true
    4. "Pular" fecha o tour sem marcar como completo
```

### Etapa 2 — Modal "Como obter URL"

**Mesmo arquivo:** `electron/renderer/tutorial.js`

```
Método showUrlHelp():
  1. Abre modal com fundo escuro
  2. Conteúdo em passos numerados:
     Passo 1: "Abra o vídeo e dê play"
     Passo 2: "Pressione F12 → Aba Network"
     Passo 3: "Filtre por 'm3u8' (ou 'media')"
     Passo 4: "Clique com direito no request → Copy → Copy URL"
     Passo 5: "Cole no StreamGrab e clique em Analisar"
  3. Espaço reservado para GIFs em assets/
  4. Botão [Fechar]
```

### Etapa 3 — Botão de ajuda flutuante

**Arquivo:** `electron/renderer/panels.js` (MODIFICAR)

```
No initializePanels():
  - Criar botão flutuante <button class="help-fab">?</button>
  - Fixo no canto inferior direito
  - Ao clicar, abrir mini-menu:
    ┌─────────────────┐
    │ 📖 Tour completo │
    │ ❓ Como obter URL│
    │ 💡 Dicas rápidas │
    │ 📄 Ver README    │
    └─────────────────┘
  - "Ver README" → shell.openExternal(repo URL)
```

### Etapa 4 — Integração no renderer principal

**Arquivo:** `electron/renderer/renderer.js` (MODIFICAR)

```
1. Importar createTutorial
2. Após panelsController.initializePanels():
   const tutorial = createTutorial({ dom, settings: appState, ... });
   appState.tutorial = tutorial;
3. Verificar settings.tutorialCompleted na inicialização:
   const settings = await window.api.settingsGet();
   if (!settings.tutorialCompleted) tutorial.start();
```

### Etapa 5 — CSS do Tour

**Arquivo:** `electron/styles.css` (MODIFICAR)

```
.tour-overlay {
  position: fixed; inset: 0; z-index: 999;
  background: rgba(0,0,0,0.6);
}
.tour-tooltip {
  position: fixed; z-index: 1000;
  background: var(--panel); border: 1px solid var(--accent);
  border-radius: 12px; padding: 16px; max-width: 360px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}
.tour-highlight {
  position: relative; z-index: 1001;
  box-shadow: 0 0 0 4px var(--accent);
  border-radius: 8px;
}
.tour-arrow { /* seta apontando para o alvo, com CSS puro */ }
.help-fab {
  position: fixed; bottom: 24px; right: 24px; z-index: 998;
  width: 48px; height: 48px; border-radius: 50%;
  background: var(--accent); color: #000;
  font-size: 20px; font-weight: bold; border: none;
  cursor: pointer; box-shadow: var(--shadow);
}
.help-fab:hover { transform: scale(1.05); }
```

### Etapa 6 — Configuração

**Arquivo:** `src/core/settings.js` (MODIFICAR)

```
Adionar ao DEFAULT_SETINGS:
  tutorialCompleted: false

Adicionar ao SCEHMA:
  tutorialCompleted: { type: 'boolean', clamp: null }
```

### Etapa 7 — HTML Templates

**Arquivo:** `electron/index.htl` (MODIFICAR)

```
Adionar template para o modal "Como obter URL" no final do body:
  <template id="urlHelpTemplate">...</template>

Adicionar container do help fab:
  <div id="helpFabContainer"></div>
```

---

## 3. Arquivos Afetados

| Aquivo | Ação|
|--------|-----|
| `eectron/renerer/tutorial.js` | **NOVO** |
| `electrn/renerer/renererer.js` | MODIFICAR |
| `elecron/renerer/panels.js` | MODIIFICAR |
| `letron/tyles.css` | MODIFICAR |
| `ectron/ndex.html` | MODIFICAR |
| `sr/core/eings.js` | MODIFICAR |

---

## 4. Tstes

| Tese | Roeimento | Resultado |
|----|----|----|
| 1ª execução | Apagar settings, iiciar app | Tur abre atomaicamente |
| Conlir tor | Passar by 4 passos, clicar "Cocluir" | tour feha, tutoralComleted = true |
| 2ª execução | Iniiar app novamente | Tour não bre mais |
| Botão ajuda | Clicar no "?" | Mi-menu abe |
| "To completo" | Clica n mini-menu | Tour eabe |
| "Cmo obter URL" | Cca no mini-menu | Modl com instruções abre |
| Tecla ESC | Durate o tur | Tour feha imediatamente |

---

## 5. Critério de Conclusão

- [ ] Tur abre atomaicamente na prmeira execução
- [ ] 4 psos com destque e toolip funcionam
- [ ] Navegação "Ateior"/"Próimo" funcional
- [ ] "Pular" e "Conlui" finalzam corretamente
- [ ] Tutoria pode ser reberto pelo btoão ?
- [ ] Moda "Como obter URL" com instruções
- [ ] Configuração `torialCompleted` persiste