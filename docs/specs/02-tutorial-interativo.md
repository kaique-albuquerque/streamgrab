# Spec: Tutorial Interativo

> **ID:** SPEC-02  
> **Status:** Rascunho  
> **Prioridade:** Alta  
> **Impacto:** 🔥🔥🔥🔥  
> **Esforço:** Baixo

---

## 1. Objetivo

Guiar novos usuários pelo fluxo de uso do StreamGrab na primeira execução, reduzindo a curva de aprendizado e o abandono inicial. O tutorial deve ser acessível novamente sempre que o usuário precisar, via botão dedicado.

---

## 2. Comportamento Atual

- O README contém instruções detalhadas, mas o app inicia sem nenhum guia.
- O usuário vê uma interface com abas, campos e botões sem contexto do que fazer primeiro.
- Não há indicador de "primeiro passo" ou onboarding.

---

## 3. Comportamento Desejado

### 3.1. Primeira Execução (Onboarding)

Na primeira vez que o app é aberto (verificado via `settings.json` → `tutorialCompleted: false`), um overlay semi-transparente cobre a interface com um tour de 4 etapas:

| Passo | Alvo | Texto |
|-------|------|-------|
| 1 | Campo URL | **"Abra o vídeo no navegador, aperte F12 → Network, filtre por 'm3u8', copie a URL do request e cole aqui."** |
| 2 | Botão "Analisar" | **"Clique em 'Analisar' para descobrir as qualidades disponíveis."** |
| 3 | Lista de qualidades | **"Escolha a qualidade desejada. A melhor disponível é usada automaticamente."** |
| 4 | Botão "Baixar agora" | **"Pronto! Clique em 'Baixar agora' e aguarde. O arquivo será salvo na pasta Downloads."** |

Cada passo tem:
- Um destaque (highlight) no elemento alvo
- Um tooltip/caixa de explicação com seta apontando para o elemento
- Botões **"Anterior"**, **"Próximo"** (ou **"Concluir"** no último passo)
- Botão **"Pular tour"** em todos os passos

### 3.2. Botão "Ajuda / Tutorial" Permanente

Um botão `?` ou **"Ajuda"** fixo no canto inferior direito da interface (sobrepondo tudo) que, ao ser clicado, reabre o tour completo ou exibe um mini-menu:

```
┌──────────────┐
│ 📖 Tour completo  │
│ ❓ Como obter URL │
│ 💡 Dicas rápidas  │
│ 📄 Ver README     │
└──────────────┘
```

### 3.3. Conteúdo do "Como obter URL"

Ao selecionar esta opção, uma modal explica visualmente:

1. Abra o vídeo no navegador e dê play
2. Pressione F12 (DevTools)
3. Vá na aba **Network**
4. Filtre por `m3u8` (ou `media`)
5. Clique no request que aparece
6. Clique com botão direito → **Copy → Copy Request URL**
7. Cole no StreamGrab

Incluir screenshots/gifs demonstrativos (carregados de `assets/`).

### 3.4. Persistência

- `settings.json` ganha o campo `tutorialCompleted: boolean`.
- `tutorialCompleted: false` → tour roda na inicialização.
- `tutorialCompleted: true` → tour não roda, mas botão de ajuda continua disponível.
- Opção "Resetar tutorial" nas Configurações.

---

## 4. APIs e Módulos

### Novo arquivo: `electron/renderer/tutorial.js`

```
TutorialController
  .start()          → inicia tour da primeira execução
  .runFullTour()    → reabre o tour completo
  .showUrlHelp()    → modal "Como obter URL"
  .showQuickTips()  → mini modal de dicas
  .stop()           → finaliza o tour
```

### IPC

- `settings:get` e `settings:update` (já existem) para ler/escrever `tutorialCompleted`.

---

## 5. Arquivos Modificados / Criados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `electron/renderer/tutorial.js` | Novo | Lógica do tour, destaques, tooltips |
| `electron/renderer/renderer.js` | Modificar | Iniciar tutorial se `!tutorialCompleted` |
| `electron/renderer/panels.js` | Modificar | Adicionar botão de ajuda fixo |
| `electron/styles.css` | Modificar | Estilos do overlay, tooltips, botão flutuante |
| `electron/index.html` | Modificar | Templates do overlay e modais |
| `src/core/settings.js` | Modificar | Campo `tutorialCompleted` adicionado aos defaults |

---

## 6. UX do Tour

```
┌─────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────┐           │
│  │  [campo URL]    (highlight)          │           │
│  └──────────────────────────────────────┘           │
│                              ▲                      │
│                              │                      │
│                      ┌──────┴──────────┐            │
│                      │ 📋 PASSO 1/4    │            │
│                      │                 │            │
│                      │ Cole a URL do   │            │
│                      │ video aqui.     │            │
│                      │                 │            │
│                      │ [Anterior] [Próximo] [Pular] │
│                      └─────────────────┘            │
└─────────────────────────────────────────────────────┘
```

## 7. Acessibilidade

- Navegação do tour por teclado (Tab + Enter).
- Botão ESC fecha o tour.
- Contraste suficiente no overlay.
- Suporte a leitores de tela (`aria-label` nos elementos do tour).

---

## 8. Testes

- Primeira execução → tour abre automaticamente.
- Completar tour → `tutorialCompleted = true`.
- Segunda execução → tour não abre.
- Clicar botão ajuda → tour reabre.
- Pular → tour fecha, `tutorialCompleted` continua `false`.
- Tecla ESC → tour fecha.