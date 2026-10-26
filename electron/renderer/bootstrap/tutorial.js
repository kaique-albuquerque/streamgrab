/** Tutorial interativo e disparo na primeira execução. */

import { createTutorialController } from '../tutorial.js';

export function setupTutorial({ appState }) {
  // Concluir ou fechar o tour conta como "já visto": ele não abre mais
  // sozinho e só reaparece pelo botão "?" (menu → Tour completo).
  const markCompleted = () => {
    window.api.settingsUpdate({ tutorialCompleted: true }).catch(() => {});
  };

  const tutorialController = createTutorialController({
    onFinish: markCompleted,
    onSkip: markCompleted,
  });
  appState.tutorial = tutorialController;

  // Inicia o tutorial na primeira execução
  window.api.settingsGet().then((settings) => {
    if (!settings?.tutorialCompleted) {
      // Pequeno delay para a UI terminar de renderizar
      setTimeout(() => tutorialController.start(), 500);
    }
  });

  return tutorialController;
}
