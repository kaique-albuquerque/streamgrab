/** Decisão de notificar conforme settings e estado da janela. */

export function createShouldNotify({ settingsGet, getWindow }) {
  return function shouldNotify() {
    try {
      const cfg = settingsGet();
      if (!cfg) return false;
      const notifConfig = cfg.notifications;
      // Pode ser boolean (true/false) ou objeto
      if (notifConfig === false) return false;

      // Se for objeto, verifica configurações individuais
      if (typeof notifConfig === 'object' && notifConfig !== null) {
        if (notifConfig.onlyWhenMinimized !== false) {
          const win = getWindow();
          if (win && !win.isMinimized() && win.isFocused()) return false;
        }
      } else {
        // Boolean true — notifica sempre, mas verifica onlyWhenMinimized default
        const win = getWindow();
        if (win && !win.isMinimized() && win.isFocused()) return false;
      }

      return true;
    } catch {
      return false;
    }
  };
}
