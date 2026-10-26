/** Agregação de eventos e orquestração das notificações. */

import { createShouldNotify } from './should-notify.js';
import { createShowNotification } from './show.js';
import { createFocusWindow } from './window.js';

const AGGREGATE_WINDOW_MS = 5000;

/**
 * Cria o gerenciador de notificações.
 *
 * @param {object} opts
 * @param {Function} opts.settingsGet - Lê settings (notifications, etc)
 * @param {Function} opts.getWindow - Retorna a BrowserWindow principal
 * @param {object} opts.shell - Electron shell (openPath)
 */
export function createNotifier({ settingsGet, getWindow, shell }) {
  let pending = [];
  let timer = null;

  const shouldNotify = createShouldNotify({ settingsGet, getWindow });
  const focusWindow = createFocusWindow(getWindow);
  const showNotification = createShowNotification({ shell, focusWindow });

  /**
   * Recebe eventos da fila/engine.
   * Chamado externamente a cada evento.
   */
  function onJobEvent(event, job) {
    if (!shouldNotify()) return;

    if (event === 'complete') {
      pending.push({ type: 'complete', job, time: Date.now() });
    } else if (event === 'error') {
      pending.push({ type: 'error', job, time: Date.now() });
    } else {
      return;
    }

    scheduleFlush();
  }

  function scheduleFlush() {
    if (timer) return;
    timer = setTimeout(flush, AGGREGATE_WINDOW_MS);
  }

  function flush() {
    timer = null;
    const events = pending.splice(0);
    if (events.length === 0) return;

    const completed = events.filter(e => e.type === 'complete');
    const failed = events.filter(e => e.type === 'error');

    if (completed.length > 0) {
      showNotification(completed, 'complete');
    }
    if (failed.length > 0) {
      showNotification(failed, 'error');
    }
  }

  function dispose() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending = [];
  }

  return { onJobEvent, dispose };
}
