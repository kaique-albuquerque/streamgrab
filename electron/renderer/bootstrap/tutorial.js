/** Tutorial interativo e disparo na primeira execução. */

import { createTutorialController } from '../tutorial.js';

export function setupTutorial({ appState }) {
  const tutorialController = createTutorialController({
    onFinish: () => {
      window.api.settingsUpdate({ tutorialCompleted: true }).catch(() => {});
    },
    onSkip: () => {
      // Não marca como completo, pode rodar de novo
    },
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
