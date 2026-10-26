/** Botão de ajuda flutuante (FAB) com o menu de atalhos do tutorial. */

export function setupHelpFab({ tutorialController }) {
  const helpFab = document.createElement('button');
  helpFab.className = 'help-fab';
  helpFab.textContent = '?';
  helpFab.title = 'Ajuda';
  helpFab.setAttribute('aria-label', 'Abrir menu de ajuda');

  helpFab.addEventListener('click', () => {
    if (tutorialController.isRunning()) return;

    const menu = document.createElement('div');
    menu.className = 'help-menu';
    menu.innerHTML = `
      <button class="help-menu-item" data-action="tour">📖 Tour completo</button>
      <button class="help-menu-item" data-action="urlhelp">❓ Como obter URL</button>
      <button class="help-menu-item" data-action="tips">💡 Dicas rápidas</button>
      <button class="help-menu-item" data-action="readme" target="_blank">📄 Ver README</button>
    `;

    // Posiciona o menu acima do FAB
    document.body.appendChild(menu);

    const closeMenu = () => { if (menu.parentNode) menu.parentNode.removeChild(menu); };

    menu.querySelector('[data-action="tour"]').addEventListener('click', () => {
      closeMenu();
      tutorialController.start();
    });
    menu.querySelector('[data-action="urlhelp"]').addEventListener('click', () => {
      closeMenu();
      tutorialController.showUrlHelp();
    });
    menu.querySelector('[data-action="tips"]').addEventListener('click', () => {
      closeMenu();
      tutorialController.showQuickTips();
    });
    menu.querySelector('[data-action="readme"]').addEventListener('click', () => {
      closeMenu();
      window.api.openExternal('https://github.com/kaique-albuquerque/streamgrab#readme').catch(() => {});
    });

    // Fecha ao clicar fora
    const outsideClick = (e) => {
      if (!menu.contains(e.target) && e.target !== helpFab) {
        closeMenu();
        document.removeEventListener('click', outsideClick);
      }
    };
    setTimeout(() => document.addEventListener('click', outsideClick), 0);
  });

  document.body.appendChild(helpFab);
  return helpFab;
}
