/**
 * Envio de eventos para todas as janelas abertas.
 */

import { BrowserWindow } from 'electron';

/** Envia um evento de fila para todas as janelas vivas. */
export function broadcast(event, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('queue:event', { event, payload });
  }
}

/** Envia a URL detectada no clipboard para todas as janelas vivas. */
export function broadcastClipboardDetection({ url, sourceType }) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('clipboard:url-detected', { url, sourceType });
    }
  }
}
