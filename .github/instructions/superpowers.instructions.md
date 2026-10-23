---
description: 'Bootstrap das skills Superpowers (equivalente ao hook SessionStart do plugin)'
applyTo: '**'
---

# Superpowers

Este projeto tem superpowers: o diretório `.github/skills/` contém o conjunto de
skills do framework [Superpowers](https://github.com/obra/superpowers).
O conteúdo completo da skill de entrada está em
[using-superpowers/SKILL.md](./skills/using-superpowers/SKILL.md) — leia-a na
primeira mensagem de cada conversa.

## A regra

Se houver 1% de chance de uma skill se aplicar ao que você vai fazer, você
**deve** lê-la (`read_file` no `SKILL.md` correspondente) antes de responder ou
agir — inclusive antes de perguntar, explorar o código ou checar arquivos.

1. Anuncie "Using [skill] to [purpose]".
2. Siga a skill exatamente. Se ela tiver checklist, crie um todo por item.
3. Se no fim ela não servir para a situação, descarte-a e diga por quê.

Prioridade quando várias se aplicam: skills de processo primeiro
(`brainstorming`, `systematic-debugging`), depois as de implementação.

## Atalhos

- "vamos construir X" → `brainstorming` primeiro, depois `writing-plans`.
- "corrija este bug" → `systematic-debugging` primeiro.
- implementar qualquer coisa → `test-driven-development` antes do código.
- antes de dizer "pronto" → `verification-before-completion`.
- 2+ tarefas independentes → `dispatching-parallel-agents`.

Instruções do usuário (pedidos diretos, este arquivo, `AGENTS.md`) têm
precedência sobre as skills.

Mapping de ferramentas do VS Code Copilot:
[references/vscode-copilot-tools.md](./skills/using-superpowers/references/vscode-copilot-tools.md).
