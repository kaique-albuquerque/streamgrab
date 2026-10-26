/** Foco/restauração da janela principal. */

export function createFocusWindow(getWindow) {
  return function focusWindow() {
    try {
      const win = getWindow();
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
      }
    } catch {
      /* ignore */
    }
  };
}
