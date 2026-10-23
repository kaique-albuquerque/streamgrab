/** Exibição da notificação nativa do Electron. */

import { Notification } from 'electron';
import { buildNotificationContent } from './messages.js';

export function createShowNotification({ shell, focusWindow }) {
  return function showNotification(events, type) {
    if (typeof Notification === 'undefined') return;

    const { title, body, onClick } = buildNotificationContent(events, type, { shell, focusWindow });

    try {
      const n = new Notification({
        title,
        body,
        silent: false,
        urgency: 'normal',
      });

      if (typeof onClick === 'function') {
        n.onclick = onClick;
      } else {
        n.onclick = () => focusWindow();
      }

      n.show();
    } catch {
      // Notificações podem falhar em alguns ambientes (Linux sem D-Bus, etc)
    }
  };
}
