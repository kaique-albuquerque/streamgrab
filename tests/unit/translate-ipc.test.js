/**
 * Testes do registro dos canais IPC de tradução.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module('electron', {
  namedExports: {
    BrowserWindow: {
      getAllWindows() {
        return [];
      },
    },
    ipcMain: {
      handle() {},
    },
    app: {
      getPath() {
        return '/tmp';
      },
    },
  },
});

test('registra os canais de tradução', async () => {
  const ipcHandlers = new Map();

  const electron = await import('electron');
  electron.ipcMain.handle = (channel, handler) => {
    ipcHandlers.set(channel, handler);
  };

  const { registerTranslateHandlers } = await import('../../electron/ipc/translate-handlers.js');
  registerTranslateHandlers();

  for (const channel of [
    'translate:start',
    'translate:cancel',
    'translate:retry',
    'translate:remove',
    'translate:job-list',
    'translate:models',
    'translate:model-status',
    'translate:model-download',
    'translate:model-cancel',
    'translate:model-delete',
  ]) {
    assert.ok(ipcHandlers.has(channel), `canal ausente: ${channel}`);
  }
});