/**
 * Registro dos handlers IPC, agrupados por domínio.
 */

import { registerAppHandlers } from '../ipc/app-handlers.js';
import { registerPlaylistHandlers } from '../ipc/playlist-handlers.js';
import { registerQueueHandlers } from '../ipc/queue-handlers.js';
import { registerPreviewHandlers } from '../ipc/preview-handlers.js';
import { registerHistoryHandlers, registerSettingsHandlers } from '../ipc/history-handlers.js';
import { registerTranscribeHandlers } from '../ipc/transcribe-handlers.js';

/** Registra todos os handlers IPC de uma vez. */
export function registerAllHandlers(clipboardWatcher) {
  registerAppHandlers(clipboardWatcher);
  registerPlaylistHandlers();
  registerQueueHandlers();
  registerPreviewHandlers();
  registerHistoryHandlers();
  registerSettingsHandlers();
  registerTranscribeHandlers();
}
