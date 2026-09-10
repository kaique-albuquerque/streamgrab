/**
 * Notifier — Notificações nativas do sistema para eventos de download.
 *
 * Usa a Notification API do Electron para notificar o usuário mesmo com
 * o aplicativo minimizado. Agrega múltiplos eventos em uma janela de 5s
 * para evitar spam de notificações.
 *
 * SPEC-05: docs/specs/05-notificacoes-nativas.md
 */

import { Notification } from 'electron';

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

  function shouldNotify() {
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

  function showNotification(events, type) {
    if (typeof Notification === 'undefined') return;

    const isMultiple = events.length > 1;
    let title;
    let body;
    let onClick;

    if (type === 'complete') {
      title = isMultiple
        ? `✅ ${events.length} downloads concluídos`
        : '✅ Download concluído';

      const names = events.slice(0, 3).map(e => e.job?.meta?.filename || 'vídeo');
      body = names.join(', ');
      if (events.length > 3) body += ` e mais ${events.length - 3}`;

      // Se for único, clique abre o arquivo
      if (!isMultiple && events[0]?.job?.meta?.output) {
        const outputPath = events[0].job.meta.output;
        onClick = () => {
          try { shell.openPath(outputPath); } catch { /* ignore */ }
          focusWindow();
        };
      }
    } else {
      title = isMultiple
        ? `❌ ${events.length} downloads falharam`
        : '❌ Falha no download';

      const firstError = events[0]?.job?.error?.message || 'erro desconhecido';
      const names = events.slice(0, 2).map(e => e.job?.meta?.filename || 'vídeo');
      body = names.join(', ');
      if (names.length) body += ` — ${firstError}`;
      else body = firstError;
    }

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
  }

  function focusWindow() {
    try {
      const win = getWindow();
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
      }
    } catch {
      /* ignore */
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